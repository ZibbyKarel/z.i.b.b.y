import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  GOAL_RUN_ARTIFACTS,
  type Goal,
  type GoalIteration,
  type GoalIterationStatus,
  type GoalParkedReason,
  type GoalRun,
  type GoalRunArtifact,
  GoalRunSchema,
  type Project,
  type ProjectBudget,
  type VerifierSpec,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { BudgetService } from "../budget/budget.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { buildResumeContext } from "../pipelines/resume-context";
import { buildVerifyCommand } from "../pipelines/verify-command";
import { isAlive, killGroup } from "../runner/runner-core";
import { prepareWorktreeDir } from "../shared/worktree-root";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { SystemConfigStore } from "../system/system-config.store";
import { WorkspaceService, WorkspaceSetupError } from "../workspace/workspace.service";
import { GoalsStorageService } from "./goals.storage.service";
import { decideStop, renderGoalProgress } from "./goal-stop";
import { GoalRunNotFoundError, GoalRunNotParkedError } from "./goals.errors";

/** Max chars of a verifier's output captured into the verdict file / resume-context. */
const VERDICT_MAX_CHARS = 4000;

/** One verifier run's verdict — its satisfied flag and the output that feeds the next iteration. */
interface VerifierVerdict {
  kind: VerifierSpec["kind"];
  runRef?: string;
  satisfied: boolean;
  output: string;
}

/** Keep the last {@link VERDICT_MAX_CHARS} of verifier output (the failing tail). */
function tailOf(text: string): string {
  const trimmed = text.trimEnd();
  return trimmed.length > VERDICT_MAX_CHARS
    ? trimmed.slice(trimmed.length - VERDICT_MAX_CHARS)
    : trimmed;
}

/**
 * Phase 12.1/12.2 — decide whether a goal `checks` verifier is safe to run, the
 * single predicate shared by the `drive()` pre-flight park and the `runVerifier`
 * floor. Returns a readable refusal reason, or `null` when it is safe to run.
 *
 * - 12.1 (no scope): neither explicit `commands` nor the project's own `checks` →
 *   the shared {@link buildVerifyCommand} would fall through to the full-monorepo
 *   `DEFAULT_VERIFY_CHECKS` (`pnpm lint && tsc && pnpm test`). Refuse it for goals.
 * - 12.2 (no safe cwd): no worktree and no project path → the only fallback is
 *   `run.cwd` (inside this repo), from which `pnpm test` climbs to the monorepo
 *   root. Refuse rather than run checks inside the repo.
 *
 * Scope is checked first so the bombed case (no scope AND no cwd) reports the root
 * misconfiguration. A scoped command with no cwd still refuses (12.2).
 */
export function checksVerifierBlocker(
  commands: string[] | undefined,
  projectChecks: string[] | undefined,
  spawnCwd: string | undefined,
): string | null {
  const hasScope = (commands?.length ?? 0) > 0 || (projectChecks?.length ?? 0) > 0;
  if (!hasScope) {
    return "no verifier scope — set goal.verifier.commands or a project's checks (refusing the full-repo default suite)";
  }
  if (!spawnCwd) {
    return "no workspace or project — refusing to run checks with cwd inside the repo";
  }
  return null;
}

/**
 * Phase 13.1 — has the goal's OWN budget (a windowed run-count) been reached? A goal
 * iteration IS one maker run, so the iteration records are the run ledger — count those
 * whose `startedAt` falls in the rolling daily / weekly window. No budget or no caps →
 * never exceeded. This is distinct from `maxIterations` (the total fuse): a per-window
 * ceiling that composes with the Phase 8.1 project cap (both checked; either parks).
 */
export function goalBudgetExceeded(
  budget: ProjectBudget | undefined,
  iterations: ReadonlyArray<{ startedAt: string }>,
  now: Date,
): boolean {
  if (!budget) return false;
  const DAY = 24 * 60 * 60 * 1000;
  const countWithin = (ms: number): number =>
    iterations.filter((i) => now.getTime() - new Date(i.startedAt).getTime() < ms).length;
  if (budget.dailyRuns !== undefined && countWithin(DAY) >= budget.dailyRuns) return true;
  if (budget.weeklyRuns !== undefined && countWithin(7 * DAY) >= budget.weeklyRuns) return true;
  return false;
}

/** DI token carrying the absolute path of the directory that holds goal run artifacts. */
export const GOAL_RUNS_DIR = "GOAL_RUNS_DIR";

const RETENTION_MS = 30 * 60 * 1000;
const MAX_LISTED = 50;
const AGGREGATE_FILE = "run.json";

/**
 * Phase 12.3 — resource governance for the deterministic `checks` verifier shell.
 * A hung command (a runaway suite, a watcher that never exits) must not wedge the
 * outer loop or accumulate RAM forever, and a kill/respawn must reap it.
 */
/** Grace after SIGTERM before escalating the process group to SIGKILL. */
const SHELL_KILL_GRACE_MS = 5000;
/** Cap the captured output (rolling tail); the verdict keeps only {@link VERDICT_MAX_CHARS} anyway. */
const SHELL_OUTPUT_CAP = 1_000_000;

/** Exit code recorded for a verifier shell killed by the `goalVerifyTimeoutMs` deadline. */
const SHELL_TIMEOUT_CODE = 124;

/**
 * The outer loop engine. A goal run iterates a *maker* (an existing agent or
 * pipeline, dispatched through its own runner untouched) against a *verifier*
 * (Phase 10.2), persisting every iteration to disk and parking when bounded
 * effort is exhausted. The goal owns ONE worktree per run; iterations accumulate
 * commits on its branch.
 *
 * This is deliberately thin glue over delivered machinery: the maker dispatch
 * reuses {@link AgentRunnerService.start} / {@link PipelineRunnerService.start}
 * verbatim (so demo mode stays the e2e seam and the mid-run approval gate applies
 * unchanged inside every iteration), and the aggregate is the
 * {@link PipelineRunnerService} pattern with `iterations[]` replacing `stageRuns[]`.
 */
@Injectable()
export class GoalRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly dir: string;
  private readonly runs = new Map<string, GoalRun>();
  /** The base prompt for each live run's maker (not persisted — recomputed from objective on restart). */
  private readonly prompts = new Map<string, string>();
  private readonly events = new EventEmitter();
  /** In-flight verifier shells (Phase 12.3) — tracked so `onModuleDestroy` reaps them. */
  private readonly liveShells = new Set<ChildProcess>();
  private readonly log: ScopedLogger;

  constructor(
    @Inject(GOAL_RUNS_DIR) dir: string,
    private readonly goals: GoalsStorageService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly projects: ProjectsStorageService,
    private readonly workspace: WorkspaceService,
    private readonly budget: BudgetService,
    private readonly activity: ActivityLogService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
    private readonly systemConfig: SystemConfigStore,
  ) {
    this.dir = path.resolve(dir);
    this.log = logger.child(GoalRunnerService.name);
    this.events.setMaxListeners(0);
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true }).catch(() => {});
    await this.reconstruct();
  }

  /**
   * Phase 12.3 — reap every in-flight verifier shell on shutdown (mirror of
   * {@link RunnerCore.shutdown}). GoalRunnerService was the only background service
   * without this hook, so a `checks` verifier child was orphaned on kill/respawn —
   * exactly the meta-circular RAM accumulation the phase exists to close. (Requires
   * `app.enableShutdownHooks()` so it also fires on SIGTERM, not just `app.close()`.)
   */
  onModuleDestroy(): void {
    for (const child of this.liveShells) killGroup(child.pid ?? 0);
    this.liveShells.clear();
  }

  /**
   * Start a run of `goalId`. Returns immediately; iterations run in the background.
   * Creates one worktree per run (Phase 3.1) when the project is a git repo, seeds
   * the aggregate, persists it, and kicks the driver.
   */
  async start(
    goalId: string,
    prompt = "",
    project = "",
    files: string[] = [],
    title = "",
    taskId?: string,
    matchedTerms?: string[],
  ): Promise<GoalRun> {
    // Throws GoalNotFoundError / InvalidGoalIdError when unknown → 404.
    const goal = await this.goals.get(goalId);
    const resolved = await this.resolveProject(project);

    const startedMs = Date.now();
    const goalRunId = `${goalId}_${startedMs}`;
    const root = path.join(this.dir, goalRunId);
    await fs.mkdir(root, { recursive: true });
    // The objective is the human-readable anchor for the whole run (a forensic artifact).
    await fs
      .writeFile(path.join(root, "objective.md"), `${goal.objective}\n`, "utf8")
      .catch(() => {});

    const run: GoalRun = {
      goalRunId,
      goalId,
      status: "running",
      currentIteration: 0,
      iterations: [],
      startedAt: new Date(startedMs).toISOString(),
      cwd: root,
      ...(taskId ? { taskId } : {}),
      ...(resolved ? { projectPath: resolved.path } : {}),
      ...(matchedTerms?.length ? { matchedTerms } : {}),
    };
    this.runs.set(goalRunId, run);
    this.prompts.set(goalRunId, prompt || goal.objective);
    await this.writeAggregate(run);

    // Phase 3.1: a git project gets ONE worktree for the whole run; every maker
    // iteration spawns there so its commits land on the goal's own branch. A
    // worktree-setup failure on a git project is fatal (no silent main-checkout use).
    if (resolved && (await this.workspace.isGitRepo(resolved.path))) {
      try {
        run.workspace = await this.workspace.createWorktree({
          projectPath: resolved.path,
          runId: goalRunId,
          slug: title || goalId,
          // Phase 12.7: the worktree lives OUTSIDE the repo/data tree; only forensic
          // artifacts stay under `root` (= GOAL_RUNS_DIR/<id>).
          dir: await prepareWorktreeDir(goalRunId),
        });
        await this.writeAggregate(run);
      } catch (error) {
        if (!(error instanceof WorkspaceSetupError)) throw error;
        run.status = "failed";
        run.currentIteration = null;
        await this.writeAggregate(run);
        this.log.error("goal run failed: worktree setup", {
          goalRunId,
          projectPath: resolved.path,
          err: error.message,
        });
        return run;
      }
    }

    this.log.info("starting goal run", {
      goalId,
      goalRunId,
      maker: `${goal.maker.kind}:${goal.maker.id}`,
      maxIterations: goal.maxIterations,
      branch: run.workspace?.branch,
    });

    const traceId = this.trace.getTraceId() ?? randomUUID();
    void this.trace
      .run({ traceId, runId: goalRunId }, () => this.drive(run, goal, resolved, files))
      .catch((err) => this.onDriveError(run, err));
    return run;
  }

  /**
   * The outer loop (Phase 10.2). The cursor is an iteration index, not a phase id:
   *
   *   loop:
   *     budget.check → over-cap? park (budget)                       [8.1]
   *     dispatch maker (agent|pipeline .start, cwd = worktree)       [inner loop]
   *     wait for maker terminal                                      [9.1 shape in 10.4]
   *     run verifier (deterministic checks ± claude pass)            [10.2]
   *     decideStop:
   *       satisfied → checkpoint commit, status done, return         [9.3]
   *       park-iterations → park, return                             [10.2]
   *       continue → compose resume-context from verdict, next       [9.3]
   *
   * `resume` re-enters at a given index with a resume-context prefix (resume-with-note
   * / 10.4 limit auto-resume). The maker dispatch reuses the inner runners verbatim.
   */
  private async drive(
    run: GoalRun,
    goal: Goal,
    project: Project | null,
    files: string[],
    resume?: { startIndex: number; resumeContext?: string; attachRunRef?: string },
  ): Promise<void> {
    let index = resume?.startIndex ?? run.currentIteration ?? 0;
    let resumeContext = resume?.resumeContext;
    // Restart re-attach: the FIRST turn waits on an existing in-flight maker run
    // instead of dispatching a fresh one (continuation, not restart).
    let attachRunRef = resume?.attachRunRef;

    // Phase 12.1/12.2: a `checks` verifier that can never run safely (no scope, or
    // no worktree/project to run it in) makes the goal structurally unsatisfiable —
    // refuse and park BEFORE spending a single maker iteration, rather than spawning
    // makers whose work could never be verified (and never the full-repo suite).
    if (goal.verifier.kind === "checks") {
      const blocker = checksVerifierBlocker(
        goal.verifier.commands,
        project?.checks,
        run.workspace?.path ?? project?.path,
      );
      if (blocker) {
        await this.parkVerifierScope(run, blocker, index);
        return;
      }
    }

    for (;;) {
      // Per-iteration budget guard (decision 6): the maker counts as one run against
      // the project's daily/weekly cap. Over-cap → park (budget) before spending it.
      const budgetOk = await this.budgetOk(project);
      if (!budgetOk) {
        await this.parkGoal(run, "budget", index);
        return;
      }
      // Phase 13.1: the goal's OWN windowed budget, independent of the project cap above.
      if (goalBudgetExceeded(goal.budget, run.iterations, new Date())) {
        this.log.info("goal parked: own budget reached", { goalRunId: run.goalRunId, index });
        await this.parkGoal(run, "budget", index);
        return;
      }

      // Reuse the record at this index when re-driving (resume / limit re-dispatch),
      // so a re-run iteration never duplicates a record — else create a new one.
      const iteration = this.iterationAt(run, goal, index);
      run.currentIteration = index;
      await this.writeAggregate(run);

      let makerRunRef: string;
      if (attachRunRef) {
        makerRunRef = attachRunRef;
        attachRunRef = undefined;
        iteration.makerRunRef = makerRunRef;
        await this.writeAggregate(run);
      } else {
        makerRunRef = await this.dispatchMaker(run, goal, project, files, resumeContext);
        iteration.makerRunRef = makerRunRef;
        await this.writeAggregate(run);
        await this.recordDispatch(run, project, makerRunRef);
        this.recordActivity(
          run,
          "goal-dispatched",
          `dispatched ${goal.maker.kind} maker for iteration ${index + 1}/${goal.maxIterations}`,
          makerRunRef,
        );
      }

      const makerStatus = await this.waitForMaker(run, goal.maker.kind, makerRunRef);
      iteration.status = makerStatus;

      // Phase 12.6: a pipeline maker that passed its OWN deterministic verify phase
      // already ran the very checks the goal's checks verifier would — skip the
      // redundant second suite. Otherwise verify normally.
      const verdict =
        this.makerAlreadyVerified(goal, project, makerStatus, makerRunRef) ??
        (await this.runVerifier(run, goal, project, index));
      iteration.verifier = {
        kind: verdict.kind,
        ...(verdict.runRef ? { runRef: verdict.runRef } : {}),
        satisfied: verdict.satisfied,
        output: verdict.output,
      };
      iteration.endedAt = new Date().toISOString();
      const verdictFile = path.join(run.cwd, `iteration-${index}.verdict.txt`);
      await fs
        .writeFile(verdictFile, verdict.output || "(no verifier output)\n", "utf8")
        .catch(() => {});
      await this.writeAggregate(run);
      this.recordActivity(
        run,
        "goal-verdict",
        `iteration ${index + 1} verifier ${verdict.satisfied ? "satisfied" : "not satisfied"}`,
        verdict.runRef,
      );
      this.log.info("goal iteration verified", {
        goalRunId: run.goalRunId,
        index,
        makerStatus,
        satisfied: verdict.satisfied,
      });

      const stop = decideStop({
        satisfied: verdict.satisfied,
        index,
        maxIterations: goal.maxIterations,
        budgetOk: true,
      });
      if (stop === "satisfied") {
        await this.checkpoint(run, goal, index);
        run.status = "done";
        run.currentIteration = null;
        await this.writeAggregate(run);
        this.log.info("goal run done (verifier satisfied)", {
          goalRunId: run.goalRunId,
          iterations: index + 1,
        });
        return;
      }
      if (stop === "park-iterations") {
        await this.parkGoal(run, "iterations", index, verdictFile);
        return;
      }
      // Continue: the verifier output becomes the next iteration's resume-context.
      resumeContext = await this.composeResumeContext(run, goal, verdict.output);
      index += 1;
    }
  }

  /**
   * The iteration record for `index` — reused when re-driving (resume / restart /
   * limit re-dispatch) so a re-run never duplicates a record, reset to a fresh
   * `running` state; created + appended otherwise.
   */
  private iterationAt(run: GoalRun, goal: Goal, index: number): GoalIteration {
    const existing = run.iterations.find((i) => i.index === index);
    if (existing) {
      existing.status = "running";
      existing.verifier = { kind: goal.verifier.kind, satisfied: false, output: "" };
      existing.startedAt = new Date().toISOString();
      existing.endedAt = undefined;
      return existing;
    }
    const iteration: GoalIteration = {
      index,
      makerKind: goal.maker.kind,
      verifier: { kind: goal.verifier.kind, satisfied: false, output: "" },
      startedAt: new Date().toISOString(),
      status: "running",
    };
    run.iterations.push(iteration);
    return iteration;
  }

  /** True when the project (if any) is under its budget cap; fail-closed via BudgetService. */
  private async budgetOk(project: Project | null): Promise<boolean> {
    const check = await this.budget.check(project?.id, new Date()).catch(() => ({ ok: true }));
    return check.ok;
  }

  /** Count this iteration's maker run against the project ledger (decision 6). */
  private async recordDispatch(
    run: GoalRun,
    project: Project | null,
    runRef: string,
  ): Promise<void> {
    await this.budget
      .recordDispatch(
        {
          at: new Date().toISOString(),
          ...(project ? { projectId: project.id } : {}),
          ...(run.taskId ? { taskId: run.taskId } : {}),
          runRef,
          kind: "goal",
        },
        new Date(),
      )
      .catch(() => {});
  }

  /**
   * Phase 12.1/12.2: park a goal whose `checks` verifier has no resolvable scope or
   * no safe cwd. Writes the readable reason as the iteration verdict so the operator
   * sees WHY in `RunDetail`, then parks with `verifier-scope` — a misconfiguration to
   * fix (add commands / a project), not a retryable failure.
   */
  private async parkVerifierScope(run: GoalRun, reason: string, index: number): Promise<void> {
    const verdictFile = path.join(run.cwd, `iteration-${index}.verdict.txt`);
    await fs.writeFile(verdictFile, `checks verifier refused: ${reason}\n`, "utf8").catch(() => {});
    await this.parkGoal(run, "verifier-scope", index, verdictFile);
  }

  /** Park the goal for the operator — durable, resumable with a note (decision 4). */
  private async parkGoal(
    run: GoalRun,
    reason: GoalParkedReason,
    index: number,
    verdictFile?: string,
  ): Promise<void> {
    run.status = "parked";
    run.parkedReason = reason;
    run.parked = {
      iteration: index,
      attempts: index + 1,
      verdictFile: verdictFile ?? path.join(run.cwd, `iteration-${index}.verdict.txt`),
    };
    run.currentIteration = index;
    await this.writeAggregate(run);
    this.recordActivity(
      run,
      "goal-parked",
      `goal parked (${reason}) after ${index + 1} iteration(s)`,
    );
    this.log.warn("goal run parked", { goalRunId: run.goalRunId, reason, iteration: index });
  }

  /**
   * Phase 9b: checkpoint the satisfied iteration on the goal's branch (worktree only;
   * a clean tree / non-git run → no-op). Local, Tier-1, ungated — NEVER pushes.
   */
  private async checkpoint(run: GoalRun, goal: Goal, index: number): Promise<void> {
    if (!run.workspace) return;
    const summary = goal.objective.slice(0, 100);
    await this.workspace
      .checkpoint({ worktreePath: run.workspace.path, phaseId: `goal-iter-${index}`, summary })
      .catch(() => null);
  }

  /**
   * Phase 12.6 — eliminate double verification. The delivery pipeline maker already
   * runs its OWN `verify` phase (the runner records the exact commands it executed on
   * the pipeline run's `verifyCommands` — a real-execution marker, never an agent
   * claim). When the goal's verifier is a `checks` verifier that would resolve to the
   * SAME commands, re-running them is pure waste — return a synthesized satisfied
   * verdict instead. Anything not provably identical (a `claude` verifier, different
   * commands, a maker with no passed verify) → `null`, so `drive()` verifies normally.
   */
  private makerAlreadyVerified(
    goal: Goal,
    project: Project | null,
    makerStatus: GoalIterationStatus,
    makerRunRef: string,
  ): VerifierVerdict | null {
    if (goal.maker.kind !== "pipeline" || makerStatus !== "done") return null;
    if (goal.verifier.kind !== "checks") return null;
    let verifiedWith: string[] | undefined;
    try {
      verifiedWith = this.pipelineRunner.get(makerRunRef).verifyCommands;
    } catch {
      return null; // maker run already pruned — verify normally
    }
    if (!verifiedWith?.length) return null;
    const goalChecks = goal.verifier.commands ?? project?.checks;
    if (!goalChecks?.length) return null;
    if (JSON.stringify(goalChecks) !== JSON.stringify(verifiedWith)) return null;
    this.log.info("goal verifier skipped — maker pipeline already verified (12.6)", {
      goalId: goal.id,
      commands: verifiedWith,
    });
    return {
      kind: "checks",
      satisfied: true,
      output:
        "satisfied by the maker pipeline's own verify phase (12.6: skipped a redundant re-run)",
    };
  }

  /**
   * Run the goal's verifier for iteration `index`. A `checks` verifier runs the
   * deterministic shell command (shared {@link buildVerifyCommand}) in the worktree
   * and is satisfied on exit 0. A `claude` verifier is a FRESH agent run on its own
   * (cheaper) model — a separate spawn with no shared session (decision 3/8) —
   * satisfied when that run completes. Either way the captured output (the failing
   * tail / the verdict text) feeds the next iteration's resume-context.
   */
  protected async runVerifier(
    run: GoalRun,
    goal: Goal,
    project: Project | null,
    index: number,
  ): Promise<VerifierVerdict> {
    const spec = goal.verifier;
    if (spec.kind === "checks") {
      // Phase 12.1/12.2 floor: never run the full-repo DEFAULT_VERIFY_CHECKS for a
      // goal, and never run checks with cwd inside this repo (run.cwd is
      // apps/api/data/goals/runs/<id>, which climbs to the monorepo root). `drive()`
      // pre-empts both with a `verifier-scope` park before any maker spawns; this is
      // the defense-in-depth floor for any direct caller. A resolvable scope =
      // explicit commands OR the project's own checks; a safe cwd = a worktree or
      // the project checkout — NOT run.cwd.
      const spawnCwd = run.workspace?.path ?? project?.path;
      const blocker = checksVerifierBlocker(spec.commands, project?.checks, spawnCwd);
      if (blocker)
        return { kind: "checks", satisfied: false, output: `checks verifier refused: ${blocker}` };

      const { command, args } = buildVerifyCommand({
        commands: spec.commands,
        projectChecks: project?.checks,
        spawnCwd,
      });
      const { code, output } = await this.runShell(command, args, spawnCwd as string);
      return { kind: "checks", satisfied: code === 0, output: tailOf(output) };
    }
    // claude verifier: a fresh agent run handed the goal + iteration context.
    const prompt = [
      `Verify whether this goal is satisfied: ${goal.objective}`,
      `This is verification iteration ${index + 1}. Inspect the working tree and report PASS or FAIL with a short reason.`,
    ].join("\n\n");
    const r = await this.agentRunner.start(
      spec.agent,
      prompt,
      project?.id ?? "",
      [],
      `verify:${goal.id}`,
      undefined,
      run.matchedTerms,
      run.workspace,
    );
    const status = await this.waitForMaker(run, "agent", r.runId);
    const log = await this.agentRunner.readLog(r.runId, 0).catch(() => null);
    return {
      kind: "claude",
      runRef: r.runId,
      satisfied: status === "done",
      output: tailOf(log?.content ?? ""),
    };
  }

  /** The verifier shell deadline (operator-owned config; tests seed a short one). */
  private shellTimeoutMs(): number {
    return this.systemConfig.current().goalVerifyTimeoutMs;
  }

  /**
   * Run a verifier shell, capturing combined stdout/stderr and the exit code, under
   * Phase 12.3 resource governance:
   * - `detached` → the child leads its own process group, so a kill reaps the whole
   *   tree (the suite + everything it spawned), not just the `/bin/sh` parent.
   * - tracked in {@link liveShells} for `onModuleDestroy` reaping; removed on settle.
   * - a wall-clock deadline ({@link shellTimeoutMs}) SIGTERMs the group, then escalates
   *   to SIGKILL after {@link SHELL_KILL_GRACE_MS} if it ignores the term — a hung
   *   suite must never wedge `drive()` forever.
   * - the output accumulator is capped to a rolling {@link SHELL_OUTPUT_CAP}-char tail.
   */
  private runShell(
    command: string,
    args: string[],
    cwd: string,
  ): Promise<{ code: number; output: string }> {
    return new Promise((resolve) => {
      let output = "";
      let settled = false;
      const child = spawn(command, args, {
        cwd,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const pgid = child.pid ?? 0;
      this.liveShells.add(child);

      const append = (d: Buffer): void => {
        output += d.toString();
        if (output.length > SHELL_OUTPUT_CAP)
          output = output.slice(output.length - SHELL_OUTPUT_CAP);
      };

      const finish = (code: number, extra = ""): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.liveShells.delete(child);
        resolve({ code, output: extra ? `${output}\n${extra}` : output });
      };

      const timer = setTimeout(() => {
        const ms = this.shellTimeoutMs();
        killGroup(pgid);
        // Escalate to SIGKILL on the group if SIGTERM was trapped/ignored.
        setTimeout(() => {
          if (isAlive(pgid)) {
            try {
              process.kill(-pgid, "SIGKILL");
            } catch {
              // already gone
            }
          }
        }, SHELL_KILL_GRACE_MS).unref?.();
        finish(SHELL_TIMEOUT_CODE, `[verifier timed out after ${ms}ms — process group killed]`);
      }, this.shellTimeoutMs());
      timer.unref?.();

      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", (err) => finish(1, err.message));
      child.on("close", (code) => finish(code ?? 1));
    });
  }

  /**
   * Assemble the resume-context for the next/resumed iteration: the goal progress,
   * the branch's checkpoint commits, the last verifier output (as `failureTail`),
   * and an optional operator note. Reuses the pipeline's pure {@link buildResumeContext}.
   */
  private async composeResumeContext(
    run: GoalRun,
    goal: Goal,
    verdictOutput: string,
    note?: string,
  ): Promise<string> {
    const checkpointLog = run.workspace
      ? await this.workspace
          .commitLog({ worktreePath: run.workspace.path, baseRef: run.workspace.baseRef })
          .catch(() => "")
      : "";
    return buildResumeContext({
      progressMd: renderGoalProgress(run, goal.objective, goal.maxIterations),
      checkpointLog,
      note,
      failureTail: verdictOutput,
    });
  }

  /** Dispatch the maker through its own runner (with the goal's worktree); return its run ref. */
  protected async dispatchMaker(
    run: GoalRun,
    goal: Goal,
    project: Project | null,
    files: string[],
    resumeContext?: string,
  ): Promise<string> {
    const prompt = this.makerPrompt(run, goal, resumeContext);
    const projectRef = project?.id ?? "";
    if (goal.maker.kind === "agent") {
      const r = await this.agentRunner.start(
        goal.maker.id,
        prompt,
        projectRef,
        files,
        goal.name ?? goal.id,
        run.taskId,
        run.matchedTerms,
        run.workspace,
      );
      return r.runId;
    }
    const r = await this.pipelineRunner.start(
      goal.maker.id,
      run.taskId,
      projectRef,
      run.matchedTerms,
      run.workspace,
    );
    return r.pipelineRunId;
  }

  /**
   * The prompt handed to an agent maker (pipeline makers run their own phases). A
   * continuation iteration prepends the resume-context so the maker knows what the
   * verifier flagged last time — the Tester→Kodér feedback shape, generalized.
   */
  protected makerPrompt(run: GoalRun, goal: Goal, resumeContext?: string): string {
    const base = this.prompts.get(run.goalRunId) ?? goal.objective;
    return [
      resumeContext?.trim() ? resumeContext.trim() : "",
      `Goal: ${goal.objective}`,
      base === goal.objective ? "" : base,
      goal.instructions,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  /**
   * Poll the maker run until it reaches a TERMINAL state, mapping it to a
   * {@link GoalIterationStatus} (`done` → done; else → failed). Rides through
   * `running`/`awaiting-approval` (the inner mid-run gate is live).
   *
   * Decision 9: a maker that pauses on the usage limit does NOT burn the iteration.
   * The goal REFLECTS the pause — `run.status = "paused-limit"` with the maker's
   * `resumeAt` for visibility — and keeps polling. The maker's own Phase 9.2
   * auto-resume (its agent/pipeline registry is already scanned) respawns it; when
   * it resumes the goal flips back to `running` and the SAME iteration completes.
   * No re-dispatch here, so there is no double-spawn with the maker's own resume.
   */
  protected async waitForMaker(
    run: GoalRun,
    kind: "agent" | "pipeline",
    runRef: string,
  ): Promise<GoalIterationStatus> {
    let reflectingPause = false;
    for (;;) {
      const raw = this.makerStatus(kind, runRef);
      if (raw === null) return "failed";
      if (raw === "paused-limit") {
        if (!reflectingPause) {
          reflectingPause = true;
          run.status = "paused-limit";
          run.resumeAt = this.makerResumeAt(kind, runRef);
          run.limitResumeCycles = run.limitResumeCycles ?? 0;
          await this.writeAggregate(run);
          this.log.warn("goal reflecting maker paused-limit", { goalRunId: run.goalRunId, runRef });
        }
        await new Promise((r) => setTimeout(r, 40));
        continue;
      }
      if (raw === "running" || raw === "awaiting-approval") {
        if (reflectingPause) {
          reflectingPause = false;
          run.status = "running";
          run.resumeAt = null;
          await this.writeAggregate(run);
        }
        await new Promise((r) => setTimeout(r, 40));
        continue;
      }
      return raw === "done" ? "done" : "failed";
    }
  }

  /** The maker run's current status, or null if the run is unknown (swept/gone). */
  private makerStatus(kind: "agent" | "pipeline", runRef: string): string | null {
    try {
      return kind === "agent"
        ? this.agentRunner.get(runRef).status
        : this.pipelineRunner.get(runRef).status;
    } catch {
      return null;
    }
  }

  /** The maker run's `resumeAt` (the usage-window reset epoch), copied up for the goal. */
  private makerResumeAt(kind: "agent" | "pipeline", runRef: string): number | null {
    try {
      const run = kind === "agent" ? this.agentRunner.get(runRef) : this.pipelineRunner.get(runRef);
      return run.resumeAt ?? null;
    } catch {
      return null;
    }
  }

  /** Resolve a run's free-form project reference by id then name; null if unknown. */
  private async resolveProject(projectRef: string): Promise<Project | null> {
    if (!projectRef) return null;
    try {
      return await this.projects.get(projectRef);
    } catch {
      const all = await this.projects.list().catch((): Project[] => []);
      return all.find((p) => p.name === projectRef) ?? null;
    }
  }

  /**
   * Resume a parked goal run with an operator note (decision 4). Re-enters `drive()`
   * at the parked iteration index with a resume-context composed from the parked
   * verdict + the note (the same operator surface as a pipeline park — identical UX,
   * distinct endpoint because the run types differ). Throws
   * {@link GoalRunNotParkedError} (→ 409) for any non-parked state.
   */
  async resumeParked(goalRunId: string, note?: string): Promise<GoalRun> {
    const run = this.runs.get(goalRunId) ?? (await this.readAggregate(goalRunId));
    if (!run) throw new GoalRunNotFoundError(goalRunId);
    this.runs.set(goalRunId, run);
    if (run.status !== "parked" || !run.parked) throw new GoalRunNotParkedError(goalRunId);

    const goal = await this.goals.get(run.goalId);
    const project = await this.projectForRun(run);
    const index = run.currentIteration ?? run.parked.iteration;
    const verdictTail = await fs.readFile(run.parked.verdictFile, "utf8").catch(() => "");
    const trimmed = note?.trim();

    run.status = "running";
    delete run.parkedReason;
    delete run.parked;
    run.currentIteration = index;
    await this.writeAggregate(run);
    this.log.info("parked goal run resumed", { goalRunId, index, withNote: Boolean(trimmed) });

    const resumeContext = await this.composeResumeContext(run, goal, verdictTail, trimmed);
    const traceId = this.trace.getTraceId() ?? randomUUID();
    void this.trace
      .run({ traceId, runId: goalRunId }, () =>
        this.drive(run, goal, project, [], { startIndex: index, resumeContext }),
      )
      .catch((err) => this.onDriveError(run, err));
    return run;
  }

  /**
   * Re-resolve a run's project from its persisted `projectPath` (resume / restart).
   * A registry record deleted meanwhile degrades to a synthetic project carrying
   * just the path — the worktree cwd still applies.
   */
  private async projectForRun(run: GoalRun): Promise<Project | null> {
    if (!run.projectPath) return null;
    const all = await this.projects.list().catch((): Project[] => []);
    return (
      all.find((p) => p.path === run.projectPath) ?? {
        id: "unregistered",
        name: "unregistered",
        path: run.projectPath,
      }
    );
  }

  list(): GoalRun[] {
    const cutoff = Date.now() - RETENTION_MS;
    const out: GoalRun[] = [];
    for (const [id, run] of this.runs) {
      const finished =
        run.status !== "running" && run.status !== "parked" && run.status !== "paused-limit";
      if (finished && Date.parse(run.startedAt) < cutoff) {
        this.runs.delete(id);
        continue;
      }
      out.push(run);
    }
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_LISTED);
  }

  /** The full goal run history (on disk + in memory), newest first; no age cutoff. */
  async listAll(): Promise<GoalRun[]> {
    const byId = new Map<string, GoalRun>();
    for (const run of await this.readAllAggregates()) byId.set(run.goalRunId, run);
    for (const [id, run] of this.runs) byId.set(id, run);
    return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  get(goalRunId: string): GoalRun {
    const run = this.runs.get(goalRunId);
    if (!run) throw new GoalRunNotFoundError(goalRunId);
    return run;
  }

  /** Permanently delete a goal run and all its artifacts (worktree pruned first). */
  async delete(goalRunId: string): Promise<void> {
    const run = this.runs.get(goalRunId) ?? (await this.readAggregate(goalRunId));
    if (!run) throw new GoalRunNotFoundError(goalRunId);
    this.runs.delete(goalRunId);
    this.prompts.delete(goalRunId);
    if (run.workspace && run.projectPath) {
      await this.workspace
        .removeWorktree({ projectPath: run.projectPath, worktreePath: run.workspace.path })
        .catch(() => {});
    }
    const root = this.resolveRunDir(goalRunId);
    if (root) await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }

  /**
   * Read one whitelisted run artifact by name. `name` must be on
   * {@link GOAL_RUN_ARTIFACTS} — anything else (incl. any traversal attempt)
   * returns null → 404; there is no generic file browser. Returns null when the
   * run is unknown or the file is absent.
   */
  async readArtifact(
    goalRunId: string,
    name: string,
  ): Promise<{ name: GoalRunArtifact["name"]; content: string } | null> {
    if (!(GOAL_RUN_ARTIFACTS as readonly string[]).includes(name)) return null;
    const allowed = name as GoalRunArtifact["name"];
    const root = this.resolveRunDir(goalRunId);
    if (!root) return null;
    const content = await fs.readFile(path.join(root, allowed), "utf8").catch(() => null);
    return content === null ? null : { name: allowed, content };
  }

  /** Subscribe to aggregate transitions of every goal run (SSE / activity recorder). */
  onRunStatus(listener: (run: GoalRun) => void): () => void {
    this.events.on("status", listener);
    return () => this.events.off("status", listener);
  }

  /** The run's folder inside the runs dir, or null if the id would escape it. */
  private resolveRunDir(goalRunId: string): string | null {
    const dir = path.resolve(this.dir, goalRunId);
    if (path.dirname(dir) !== this.dir) return null;
    return dir;
  }

  protected async writeAggregate(run: GoalRun): Promise<void> {
    await fs
      .writeFile(path.join(run.cwd, AGGREGATE_FILE), JSON.stringify(run), "utf8")
      .catch(() => {});
    this.events.emit("status", run);
  }

  /** Read a run's aggregate `run.json` from disk (for a run dropped from memory). */
  protected async readAggregate(goalRunId: string): Promise<GoalRun | null> {
    const root = this.resolveRunDir(goalRunId);
    if (!root) return null;
    const raw = await fs.readFile(path.join(root, AGGREGATE_FILE), "utf8").catch(() => null);
    if (raw === null) return null;
    try {
      const parsed = GoalRunSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /** Read every `<id>/run.json` aggregate from disk. */
  private async readAllAggregates(): Promise<GoalRun[]> {
    const entries = await fs.readdir(this.dir, { withFileTypes: true }).catch(() => []);
    const out: GoalRun[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const run = await this.readAggregate(entry.name);
      if (run) out.push(run);
    }
    return out;
  }

  /**
   * Rebuild the registry from disk and reconcile mid-flight runs (decision 10,
   * run-ref-aware). The inner runners' registries are already rebuilt (GoalsModule
   * imports them, so they init first), so an iteration's maker run reflects its
   * reconciled status:
   * - terminal (`done`/`failed`) or `parked` → durable, left as-is.
   * - `running`/`paused-limit` goal whose maker is still alive/durable
   *   (`running`/`paused-limit`) → re-ATTACH the wait (continuation, no re-dispatch),
   *   so the maker's own Phase 9.2 auto-resume owns a paused maker.
   * - `running`/`paused-limit` goal whose maker died with the API
   *   (`interrupted`/`failed`/missing) → re-DISPATCH that iteration fresh with
   *   resume-context (the worktree + checkpoints survive on disk).
   */
  private async reconstruct(): Promise<void> {
    // Phase 12.4 (Law 3): registry rehydration ALWAYS happens so live runs are
    // visible/answerable; re-driving is GATED. By default a `running`/`paused-limit`
    // goal is NOT auto-re-dispatched on boot — under `ts-node-dev --respawn` + claude
    // mode a restart alone would spawn a real `claude` with no operator approval
    // (Tier 3). Instead it is parked `awaiting-resume` and surfaced for an explicit
    // operator resume. The operator-owned `systemConfig.goalAutoResume` restores
    // auto-reconcile for the headless launchd daemon (Phase 8.3).
    const autoResume = this.systemConfig.current().goalAutoResume;
    for (const run of await this.readAllAggregates()) {
      this.runs.set(run.goalRunId, run);
      if (run.status !== "running" && run.status !== "paused-limit") continue;
      if (autoResume) {
        void this.reconcileGoal(run).catch((err) => this.onDriveError(run, err));
      } else {
        await this.parkGoal(run, "awaiting-resume", run.currentIteration ?? 0);
        this.log.info("goal rehydrated, awaiting operator resume (Law 3 boot gate)", {
          goalRunId: run.goalRunId,
        });
      }
    }
  }

  /**
   * A fire-and-forget `drive()` rejected (e.g. a dispatch-time PipelineNotFoundError):
   * mark the run failed and log, so it never becomes an unhandled promise rejection.
   */
  private async onDriveError(run: GoalRun, err: unknown): Promise<void> {
    this.log.error("goal drive threw — failing run", {
      goalRunId: run.goalRunId,
      err: err instanceof Error ? err.message : String(err),
    });
    run.status = "failed";
    run.currentIteration = null;
    await this.writeAggregate(run).catch(() => {});
  }

  private async reconcileGoal(run: GoalRun): Promise<void> {
    const goal = await this.goals.get(run.goalId).catch(() => null);
    if (!goal) {
      run.status = "failed";
      run.currentIteration = null;
      await this.writeAggregate(run);
      return;
    }
    const project = await this.projectForRun(run);
    const index = run.currentIteration ?? 0;
    const iteration = run.iterations.find((i) => i.index === index);
    const makerRunRef = iteration?.makerRunRef;
    const makerStatus = makerRunRef ? this.makerStatus(goal.maker.kind, makerRunRef) : null;
    const traceId = randomUUID();

    if (makerRunRef && (makerStatus === "running" || makerStatus === "paused-limit")) {
      // The maker survived — re-attach the wait; its own 9.2 owns a paused maker.
      this.log.info("goal reconcile: re-attaching to in-flight maker", {
        goalRunId: run.goalRunId,
        index,
        makerStatus,
      });
      void this.trace
        .run({ traceId, runId: run.goalRunId }, () =>
          this.drive(run, goal, project, [], { startIndex: index, attachRunRef: makerRunRef }),
        )
        .catch((err) => this.onDriveError(run, err));
      return;
    }

    // The maker died with the API → re-dispatch this iteration fresh (continuation).
    this.log.info("goal reconcile: re-dispatching dead maker iteration", {
      goalRunId: run.goalRunId,
      index,
      makerStatus,
    });
    run.status = "running";
    run.resumeAt = null;
    await this.writeAggregate(run);
    const lastVerdict = iteration?.verifier.output ?? "";
    const resumeContext = await this.composeResumeContext(run, goal, lastVerdict);
    void this.trace
      .run({ traceId, runId: run.goalRunId }, () =>
        this.drive(run, goal, project, [], { startIndex: index, resumeContext }),
      )
      .catch((err) => this.onDriveError(run, err));
  }

  /** Emit a never-throws goal activity entry (Tier 1, silent + recorded). */
  private recordActivity(
    run: GoalRun,
    kind: "goal-dispatched" | "goal-verdict" | "goal-parked",
    summary: string,
    runRef?: string,
  ): void {
    void this.activity.record({
      kind,
      summary,
      refs: { goalRunId: run.goalRunId, goalId: run.goalId, ...(runRef ? { runRef } : {}) },
    });
  }
}
