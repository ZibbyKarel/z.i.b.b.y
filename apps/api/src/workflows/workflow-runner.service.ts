import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  type ArtifactKind,
  type DepartmentId,
  type IntendedAction,
  type PhaseEscalation,
  type Project,
  type RunLogChunk,
  type StageRun,
  type StageVerdict,
  type TaskOutput,
  WORKFLOW_RUN_ARTIFACTS,
  type Workflow,
  type WorkflowOutput,
  type WorkflowPhase,
  type WorkflowRun,
  type WorkflowRunArtifact,
  WorkflowRunSchema,
  type Workspace,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { SignalBusService } from "../automations/signal-bus.service";
import { ArtifactsStorageService, artifactRecordId } from "../artifacts/artifacts.storage.service";
import { EmployeeAllocator, type EmployeeLease } from "../employees/employee-allocator";
import { type FuseSlot, WorkingAgentsFuse } from "../employees/working-agents-fuse";
import { NoEmployeeError } from "../employees/employees.errors";
import { GateEvaluatorService } from "../gates/gate-evaluator.service";
import { GroundingService } from "../memory/grounding.service";
import { DuplicateNoteError, VaultService } from "../memory/vault.service";
import { ClaudePreflightService } from "../runner/claude-preflight.service";
import { ClaudeRunCommandService } from "../runner/claude-run-command.service";
import { formatClaudeStreamLine } from "../runner/claude-stream-format";
import { CommandMaterializerService } from "../runner/command-materializer.service";
import { RunnerCore } from "../runner/runner-core";
import { LimitsService } from "../limits/limits.service";
import { ProjectLocalService } from "../projects/project-local.service";
import { ProjectLocalUnresolvedError } from "../projects/projects.errors";
import { ProjectSecretsStore } from "../projects/project-secrets.store";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { writeFileAtomic } from "../shared/file-storage/file-utils";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { prepareWorktreeDir } from "../shared/worktree-root";
import { WorkspaceService, WorkspaceSetupError } from "../workspace/workspace.service";
import { buildStageTask } from "./build-stage-task";
import { WorkflowsStorageService } from "./workflows.storage.service";
import { type WorkflowStageRecord, workflowStageStrategy } from "./workflow-stage.record";
import { renderProgress } from "./progress";
import { buildResumeContext } from "./resume-context";
import { parseStageVerdict } from "./stage-verdict";
import { buildVerifyCommand, resolveVerifyChecks } from "./verify-command";

/** DI token carrying the absolute path of the directory that holds workflow run artifacts. */
export const WORKFLOW_RUNS_DIR = "WORKFLOW_RUNS_DIR";

const RETENTION_MS = 30 * 60 * 1000;
/** Repo-root `node_modules/.bin` (anchored like `data-dir.ts`), on every stage's PATH. */
const REPO_BIN_DIR = path.resolve(__dirname, "..", "..", "..", "..", "node_modules", ".bin");
const MAX_LISTED = 50;
const AGGREGATE_FILE = "run.json";

/** How deep `workflow` phases may nest sub-runs (parent → child → grandchild …). */
const MAX_SUB_RUN_DEPTH = 3;

/** Total spend of a run: model + external cost over every stage. */
function runSpend(run: WorkflowRun): number {
  return run.stageRuns.reduce((sum, s) => sum + (s.costUsd ?? 0) + (s.externalCostUsd ?? 0), 0);
}

/**
 * P1-03 snapshot of the spend cap at start. A sub-run shares its parent's cap: it gets
 * at most the parent's remaining spend, even when its own workflow is uncapped.
 */
function budgetSnapshot(
  own: Workflow["budget"],
  parentRemaining: number | undefined,
): { budget?: NonNullable<WorkflowRun["budget"]> } {
  if (parentRemaining === undefined) return own ? { budget: { ...own, spentUsd: 0 } } : {};
  const maxCostUsd = Math.min(own?.maxCostUsd ?? parentRemaining, parentRemaining);
  return { budget: { maxCostUsd, warnAtPct: own?.warnAtPct ?? 70, spentUsd: 0 } };
}

/**
 * TODO 13 — the workflow-level precondition on the run's project. Returns the
 * human-readable reason the run must not start, or null when it may.
 */
export function unmetRequirement(
  workflow: Pick<Workflow, "requires">,
  project: Pick<Project, "id" | "web"> | null,
): string | null {
  if (!workflow.requires?.includes("web")) return null;
  if (!project) return "requires a web project, but the run has no project";
  if (!project.web) return `requires a web project, but project "${project.id}" has no web.url`;
  return null;
}

/**
 * Departments whose delivered artifacts are handed on as a signal (A3, TODO 13).
 * Every other owner emits nothing. `title`/`ask` shape the dispatched task text.
 */
const ARTIFACT_SIGNALS: Partial<
  Record<DepartmentId, { kind: string; title: string; ask: string }>
> = {
  rnd: {
    kind: "research-artifact",
    title: "Research: research artifact",
    ask: "Build on this research.",
  },
  qa: {
    kind: "qa-findings",
    title: "QA: findings",
    ask: "Reproduce and fix the confirmed defects.",
  },
};

// Re-exported so the controller can map it to a 404 without importing the core.
export { RunNotFoundError } from "../runner/runner-core";

/** Raised when a workflow run id is unknown — controllers map it to a 404. */
export class WorkflowRunNotFoundError extends Error {
  constructor(id: string) {
    super(`Workflow run "${id}" not found`);
    this.name = "WorkflowRunNotFoundError";
  }
}

/**
 * Raised when resume-with-note targets a run that is not retries-parked —
 * controllers map it to a 409. Approval-parked runs resume only through the
 * approvals path, so there is exactly one gate per parking machine.
 */
export class RunNotRetriesParkedError extends Error {
  constructor(id: string) {
    super(`Workflow run "${id}" is not retries-parked`);
    this.name = "RunNotRetriesParkedError";
  }
}

/**
 * Phase 43 — raised when {@link WorkflowRunnerService.stop} targets a run with no
 * live stage child to kill (already terminal, parked, or paused-limit) — controllers
 * map it to a 409. Only a truly `running` run owns a process to interrupt.
 */
export class WorkflowRunNotStoppableError extends Error {
  constructor(id: string) {
    super(`Workflow run "${id}" is not running`);
    this.name = "WorkflowRunNotStoppableError";
  }
}

/**
 * Runs a workflow by chaining its phases through the shared {@link RunnerCore}: one
 * child process per phase (so each stage's log polls independently), handoff over
 * disk (phase N's `produces` is copied into phase N+1's `consumes`), and the
 * tester loop / back-edge with `maxRetries` as a hard fuse against an infinite
 * loop.
 *
 * The aggregate {@link WorkflowRun} is held in memory and mirrored to a
 * `<runRoot>/run.json` sidecar after every transition, so a restart can report an
 * accurate `currentStage`. A workflow can't auto-resume a mid-flight child, so a
 * run left `running` at restart is reconciled to `failed` (same honesty as agent
 * runs being relabelled `interrupted`).
 */
@Injectable()
export class WorkflowRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly dir: string;
  private readonly core: RunnerCore<WorkflowStageRecord>;
  private readonly runs = new Map<string, WorkflowRun>();
  /**
   * Phase 43 — workflow run ids with an operator-requested stop in flight. Set by
   * {@link stop} right before killing the live stage child; consumed (and cleared)
   * by {@link drive} the moment that stage's `waitForStage` returns, so the loop
   * lands the aggregate `interrupted` instead of taking its normal retry/park path.
   */
  private readonly stopRequested = new Set<string>();
  /**
   * Set once the API is shutting down: `core.shutdown()` kills every live stage
   * child, and without this the driver would read that kill as a stage failure and
   * spend a retry spawning the loop target — which dies with the process moments later.
   */
  private shuttingDown = false;
  private readonly log: ScopedLogger;
  /**
   * Push channel for aggregate transitions. Unlike agent runs (whose lifecycle the
   * core owns), the workflow aggregate lives here, so the event fires from
   * {@link writeAggregate} — every persisted transition (stage advance, finish)
   * notifies the `/api/events` SSE channel, replacing the FE's 1s aggregate poll.
   */
  private readonly events = new EventEmitter();

  constructor(
    @Inject(WORKFLOW_RUNS_DIR) dir: string,
    private readonly workflows: WorkflowsStorageService,
    private readonly agents: AgentsStorageService,
    private readonly claude: ClaudeRunCommandService,
    private readonly commandMaterializer: CommandMaterializerService,
    private readonly preflight: ClaudePreflightService,
    private readonly approvals: ApprovalsService,
    private readonly gates: GateEvaluatorService,
    private readonly projects: ProjectsStorageService,
    private readonly workspace: WorkspaceService,
    private readonly grounding: GroundingService,
    private readonly vault: VaultService,
    private readonly limits: LimitsService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
    private readonly projectSecrets: ProjectSecretsStore,
    private readonly activity: ActivityLogService,
    private readonly artifacts: ArtifactsStorageService,
    private readonly projectLocal: ProjectLocalService,
    private readonly employees: EmployeeAllocator,
    private readonly fuse: WorkingAgentsFuse,
    // R&D/QA deliveries are emitted as signals (a leaf module).
    private readonly signalBus: SignalBusService,
  ) {
    this.dir = path.resolve(dir);
    this.log = logger.child(WorkflowRunnerService.name);
    // One listener per open SSE connection; lift the default cap of 10.
    this.events.setMaxListeners(0);
    // Variant B for stages: a live claude stage announcing a destructive action
    // (via the hook's intent-request.json) routes through the gate evaluator.
    this.core = new RunnerCore(
      this.dir,
      workflowStageStrategy,
      // Phase 9: a stage's usage-limit line busts the limits cache (previously the
      // workflow runner dropped the signal entirely — undefined here).
      () => this.limits.noteLimitHit(),
      (stageRunId, action) => this.onStageIntent(stageRunId, action),
      logger.child("RunnerCore:workflow"),
      // Flatten each claude stream-json event back into readable log text, so a
      // stage's log shows the agent's whole run (thinking + tool calls), not just
      // its final message. Pass-through on any non-stream-json line, so verify
      // shell stages and demo stages are unaffected (mirrors the agent runner).
      formatClaudeStreamLine,
      // Phase 9: resolve a limit-paused stage's resume epoch so the core stamps it on
      // the stage record (the aggregate copies it up).
      (detected) => this.limits.resolveResumeAt(detected),
    );
  }

  async onModuleInit(): Promise<void> {
    // Approval decisions on a parked stage route back here: approve releases the
    // blocked child (the same live process continues), reject aborts it — the
    // stage lands `interrupted` and the driver takes its normal failure path.
    this.approvals.register("workflow-stage", {
      resume: async (stageRunId) => {
        try {
          await this.core.resume(stageRunId);
          await this.setAggregateStatus(stageRunId, "running");
        } catch (error) {
          // The run may have been deleted while its approval sat in the queue.
          this.log.warn("workflow-stage resume skipped (run not found)", {
            stageRunId,
            err: error instanceof Error ? error.message : String(error),
          });
        }
      },
      cancel: (stageRunId) => {
        try {
          this.core.cancel(stageRunId);
        } catch (error) {
          this.log.warn("workflow-stage cancel skipped (run not found)", {
            stageRunId,
            err: error instanceof Error ? error.message : String(error),
          });
        }
      },
    });
    // A workflow-level `pr` output sink parks the whole aggregate (no live child).
    // The approval's runId IS the workflowRunId: approve → run the gated push and
    // finish the run; reject → leave the branch work without a PR (still `done`).
    this.approvals.register("workflow-output", {
      resume: (workflowRunId) => this.resumeOutput(workflowRunId, "approved"),
      cancel: (workflowRunId) => void this.resumeOutput(workflowRunId, "rejected"),
    });
    // P1-02/P1-03: a run parked at a phase boundary (stage checkpoint or spend cap).
    this.approvals.register("workflow-gate", {
      resume: (workflowRunId) => this.resumeGate(workflowRunId, "approved"),
      cancel: (workflowRunId) => void this.resumeGate(workflowRunId, "rejected"),
      revise: (workflowRunId, note) => this.resumeGate(workflowRunId, "revised", note),
    });
    await this.core.init();
    await this.reconstruct();
    // Registered after the sweep so reconstruct's own writes never settle a parent twice.
    this.events.on("status", (run: WorkflowRun) => void this.onChildStatus(run));
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    await this.core.shutdown();
  }

  /**
   * Start a run of `workflowId`. Returns immediately; phases run in the background.
   * `project` (id or name from the request) resolves against the registry: its
   * `path` becomes the spawn cwd of claude stages and the verify-phase cwd, and
   * its `checks` the verify fallback. Unresolvable → sandbox-only (deterministic
   * for demo/e2e).
   */
  async start(
    workflowId: string,
    taskId?: string,
    projectRef?: string,
    matchedTerms?: string[],
    /**
     * Phase 10: a goal supplies its per-run worktree so every stage of this maker
     * iteration spawns on the goal's branch. When present the runner skips
     * self-creating a worktree. Absent for every existing caller (no behaviour change).
     */
    externalWorkspace?: Workspace,
    /**
     * The originating task's chosen output (the dialog selector). When set it OVERRIDES
     * the workflow definition's `outputs:` for this run only — `void` suppresses even a
     * declared `pr`. Absent = inherit the definition (every existing caller).
     */
    taskOutput?: TaskOutput,
    /**
     * N2b: initial input content for the FIRST phase's `consumes` handoff — an
     * upstream chain artifact (or a chain's instructions). Written to
     * `<run>/context/input.md` (P1-T3: durable, files-as-truth, alongside any other
     * workflow-level input) and threaded as the initial handoff source, exactly
     * like an inner-workflow `produces` → `consumes` copy. Absent for every
     * existing caller (no behaviour change).
     */
    input?: string,
    /**
     * Sub-run: the parent run whose `workflow` phase starts this one, and the parent's
     * remaining spend (the child shares the parent's cap — it never gets more).
     */
    child?: { parentRunId: string; maxCostUsd?: number },
  ): Promise<WorkflowRun> {
    // Throws WorkflowNotFoundError / InvalidWorkflowIdError when unknown → 404.
    const workflow = await this.workflows.get(workflowId);

    // Claude-mode stages spawn real `claude -p` sessions — refuse the whole run
    // up front when the CLI can't start one (→ 503). Demo workflows keep working.
    if (process.env.AGENT_RUNNER_MODE === "claude") {
      await this.preflight.assertAvailable();
    }

    // A caller-named project wins; else the workflow's own default binding.
    const project = await this.resolveProject(projectRef ?? workflow.project);

    // Two starts of the same workflow in one millisecond would share an id (and a
    // run folder) — claim the folder exclusively and bump the stamp on a clash.
    await fs.mkdir(this.dir, { recursive: true });
    let startedMs = Date.now();
    for (;;) {
      const claimed = await fs
        .mkdir(path.join(this.dir, `${workflowId}_${startedMs}`))
        .then(() => !this.runs.has(`${workflowId}_${startedMs}`))
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "EEXIST") return false;
          throw error;
        });
      if (claimed) break;
      startedMs += 1;
    }
    const workflowRunId = `${workflowId}_${startedMs}`;
    const root = path.join(this.dir, workflowRunId);
    // P1-T3 (Fáze 3): workflow-level inputs live in a shared, read-only `context/`
    // folder off the run root — every stage symlinks it in (below) so the whole
    // run's inputs are available everywhere without duplicating them into each
    // stage's sandbox. Created unconditionally (even when this run carries no
    // chain input) so every stage's `context` symlink resolves to a real folder.
    const contextDir = path.join(root, "context");
    await fs.mkdir(contextDir, { recursive: true });

    const firstPhase = workflow.phases[0];
    const run: WorkflowRun = {
      workflowRunId,
      workflowId,
      status: "running",
      currentStage: firstPhase ? firstPhase.id : null,
      stageRuns: [],
      startedAt: new Date(startedMs).toISOString(),
      cwd: root,
      ...(taskId ? { taskId } : {}),
      ...(project ? { projectPath: project.path } : {}),
      // Persisted so a parked/resumed run re-grounds each stage identically after
      // a restart (Phase 4) — the classifier's matched terms drive MOC selection.
      ...(matchedTerms?.length ? { matchedTerms } : {}),
      // A directed task's output choice overrides the definition's `outputs:` for this
      // run (void → [] suppresses even a declared PR). Absent = inherit.
      ...(taskOutput ? { outputsOverride: this.toOutputsOverride(taskOutput, workflow) } : {}),
      // P1-03: snapshot the spend cap so a later edit of the workflow never moves
      // the goalposts under a run already in flight.
      ...budgetSnapshot(workflow.budget, child?.maxCostUsd),
      ...(child ? { parentRunId: child.parentRunId } : {}),
    };
    this.runs.set(workflowRunId, run);
    await this.writeAggregate(run);

    // TODO 13: an unmet `requires` ends the run here — before any worktree, stage
    // or agent — with the reason recorded on the aggregate (never a silent no-op).
    const unmet = unmetRequirement(workflow, project);
    if (unmet) {
      run.status = "failed";
      run.currentStage = null;
      run.failedReason = unmet;
      await this.writeAggregate(run);
      this.log.warn("workflow run refused: unmet requirement", { workflowRunId, reason: unmet });
      return run;
    }

    // Phase 3.1: a git project gets a dedicated worktree under the run dir so every
    // stage works on the run's own `zibby/*` branch (the operator's checkout is
    // never touched). A non-git project keeps the Phase 2 direct-checkout cwd. A
    // *git* project whose worktree creation fails must NOT silently fall back onto
    // the main checkout — that is exactly what 3.1 prevents — so the run is born
    // failed (no driver) with the reason logged.
    if (externalWorkspace) {
      // Phase 10: spawn every stage on the goal's branch; the goal owns the worktree.
      run.workspace = externalWorkspace;
      await this.writeAggregate(run);
    } else if (project) {
      // Phase 77: resolve THIS machine's local clone first (clone into cloneRoot
      // when absent+gitRemote); a project that's absent with no remote fails the
      // run just as clearly as a worktree-setup failure — same catch, same
      // failed-run path.
      try {
        const local = await this.projectLocal.resolveForRun(project);
        if (local.isGitRepo) {
          run.workspace = await this.workspace.createWorktree({
            projectPath: local.path,
            runId: workflowRunId,
            slug: workflowId,
            // Phase 12.7: worktree OUTSIDE the repo/data tree (only artifacts stay under root).
            dir: await prepareWorktreeDir(workflowRunId),
          });
          await this.writeAggregate(run);
        }
      } catch (error) {
        if (
          !(error instanceof WorkspaceSetupError) &&
          !(error instanceof ProjectLocalUnresolvedError)
        ) {
          throw error;
        }
        run.status = "failed";
        run.currentStage = null;
        await this.writeAggregate(run);
        this.log.error("workflow run failed: worktree setup", {
          workflowRunId,
          projectPath: project.path,
          err: error.message,
        });
        return run;
      }
    }

    this.log.info("starting workflow run", {
      workflowId,
      workflowRunId,
      phases: workflow.phases.length,
      projectPath: project?.path,
      branch: run.workspace?.branch,
    });

    // N2b: materialize the operator/task input as the first phase's handoff. This
    // IS the workflow-level input (P1-T3 investigation: no other file plays that
    // role — `readArtifact`'s allowlist never includes it and no resume path ever
    // re-derives it from disk, so it is read exactly once, right below, within this
    // same call). It lives in `context/` (durable, files-as-truth) alongside any
    // other workflow-level input, and drive() copies it into the first stage's
    // `consumes` via the same placeHandoff path as any inner handoff.
    let initialHandoff: string | null = null;
    if (input !== undefined && workflow.phases[0]?.consumes) {
      initialHandoff = path.join(contextDir, "input.md");
      await fs.writeFile(initialHandoff, input, "utf8");
      // Fáze 3: workflow inputs are read-only for every phase — they are inputs of
      // the whole run, not a stage's own handoff artifact.
      await fs.chmod(initialHandoff, 0o444).catch(() => {});
    }

    // P1-T3 (Fáze 4): `output/` is the run's canonical delivery source — created
    // here for consistency with `context/`, populated lazily by `resolveOutputSource`
    // the first time a terminal output actually needs it (see there).
    await fs.mkdir(path.join(root, "output"), { recursive: true });

    // Fire-and-forget driver; the FE polls getRun for progress. The driver runs
    // after this request returns, so re-open a logging scope keyed by the run id
    // (carrying the originating trace id) for every line the background work emits.
    const traceId = this.trace.getTraceId() ?? randomUUID();
    const firstCursor = workflow.phases[0]?.id;
    void this.trace.run({ traceId, runId: workflowRunId }, () =>
      initialHandoff && firstCursor
        ? this.drive(run, workflow, project, {
            cursor: firstCursor,
            handoffSource: initialHandoff,
            retries: new Map(),
          })
        : this.drive(run, workflow, project),
    );
    return run;
  }

  /**
   * Resolve the request's free-form project reference against the registry —
   * by id first, then by exact name. Unknown/absent → null (sandbox-only run);
   * never throws (the project is an enhancement, not a precondition).
   */
  private async resolveProject(projectRef: string | undefined): Promise<Project | null> {
    if (!projectRef) return null;
    try {
      return await this.projects.get(projectRef);
    } catch {
      const all = await this.projects.list().catch((): Project[] => []);
      return all.find((p) => p.name === projectRef) ?? null;
    }
  }

  /**
   * Re-resolve a run's project from its persisted `projectPath` (for resume
   * after restart). A registry record deleted in the meantime degrades to a
   * synthetic project carrying just the path — cwd still applies, checks fall
   * back to the defaults.
   */
  private async projectForRun(run: WorkflowRun): Promise<Project | null> {
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

  /**
   * Resume a retries-parked run with an operator note: the note lands in
   * `<phaseId>.note.md` AND is appended to the failure context file (so the
   * retried phase sees failure + guidance in one handoff), the parked phase's
   * retry counter resets, and the driver re-enters the machine at `loop.to`.
   * Throws {@link RunNotRetriesParkedError} (→ 409) for any other state.
   */
  async resumeParked(workflowRunId: string, note?: string): Promise<WorkflowRun> {
    let run = this.runs.get(workflowRunId);
    if (!run) {
      const fromDisk = await this.readAggregate(workflowRunId);
      if (!fromDisk) throw new WorkflowRunNotFoundError(workflowRunId);
      this.runs.set(workflowRunId, fromDisk);
      run = fromDisk;
    }
    // Phase 9 widens the resumable parkings from `retries`-only to `retries | limit`.
    const isLimit = run.parkedReason === "limit";
    if (run.status !== "parked" || (run.parkedReason !== "retries" && !isLimit) || !run.parked) {
      throw new RunNotRetriesParkedError(workflowRunId);
    }
    const workflow = await this.workflows.get(run.workflowId);
    const parked = run.parked;
    const phase = workflow.phases.find((p) => p.id === parked.phaseId);
    // A retries-parking re-enters the loop back-edge (needs a loop); a limit-parking
    // re-runs the parked phase itself, so it only needs the phase to still exist.
    if (!phase) throw new RunNotRetriesParkedError(workflowRunId);
    if (!isLimit && !phase.loop) throw new RunNotRetriesParkedError(workflowRunId);

    const trimmed = note?.trim();
    if (trimmed) {
      await fs
        .writeFile(path.join(run.cwd, `${parked.phaseId}.note.md`), `${trimmed}\n`, "utf8")
        .catch(() => {});
      await fs
        .appendFile(parked.failureFile, `\n\n## Operator note\n\n${trimmed}\n`, "utf8")
        .catch(() => {});
    }

    const retries = new Map(Object.entries(run.retries ?? {}));
    // A limit-parking does NOT reset the loop retry map (the pause never consumed it);
    // a retries-parking resets the parked phase's counter so the loop gets a fresh run.
    if (!isLimit) retries.set(parked.phaseId, 0);

    // Limit: re-run the parked phase in place; retries: take the loop back-edge.
    const cursor = isLimit ? parked.phaseId : (phase.loop as NonNullable<typeof phase.loop>).to;
    // Limit: the failure file is just a flap note — feed the real upstream handoff;
    // retries: the failure context IS the handoff the retried phase consumes.
    const handoffSource = isLimit
      ? this.recomputeHandoff(run, workflow, cursor)
      : parked.failureFile;

    run.status = "running";
    delete run.parkedReason;
    delete run.parked;
    run.retries = Object.fromEntries(retries);
    run.currentStage = cursor;
    await this.writeAggregate(run);
    this.log.info("parked workflow run resumed", {
      workflowRunId,
      phase: parked.phaseId,
      reason: isLimit ? "limit" : "retries",
      resumeTo: cursor,
      withNote: Boolean(trimmed),
    });

    const project = await this.projectForRun(run);
    // Phase 9.3: the retried/resumed phase carries the resume-context (progress +
    // committed checkpoints + the operator note, when given). A retries-parking also
    // carries its failure context; a limit-parking's "flap note" file isn't a failure.
    const failureTail = isLimit
      ? undefined
      : await fs.readFile(parked.failureFile, "utf8").catch(() => undefined);
    const resumeContext = await this.composeResumeContext(
      run,
      workflow.phases.map((p) => p.id),
      { note: trimmed, failureTail },
    );
    const traceId = this.trace.getTraceId() ?? randomUUID();
    void this.trace.run({ traceId, runId: workflowRunId }, () =>
      this.drive(run, workflow, project, { cursor, handoffSource, retries, resumeContext }),
    );
    return run;
  }

  /**
   * Phase 9: the workflow runs currently paused on the usage limit (each carries its
   * `resumeAt` + `limitResumeCycles`). The {@link LimitResumeService} scans this on a
   * tick and resumes the due ones.
   */
  listLimitPaused(): WorkflowRun[] {
    return this.list().filter((r) => r.status === "paused-limit");
  }

  /**
   * Phase 9: auto-resume a limit-paused workflow run. Bumps the resume-cycle counter,
   * discards any mid-stage paused stage record (so the resume scan / a restart can't
   * re-detect it), and re-drives from the current phase — re-running it fresh (with
   * resume-context once 9.3 lands). If the window is still exhausted the driver's
   * boundary check re-pauses it immediately (cheap, no token), burning one cycle.
   */
  async resumeLimitPaused(workflowRunId: string): Promise<WorkflowRun> {
    const run = this.runs.get(workflowRunId) ?? (await this.readAggregate(workflowRunId));
    if (!run) throw new WorkflowRunNotFoundError(workflowRunId);
    this.runs.set(workflowRunId, run);
    if (run.status !== "paused-limit") return run;
    const workflow = await this.workflows.get(run.workflowId);
    for (const s of run.stageRuns) {
      if (s.status === "paused-limit") await this.core.discardPausedLimit(s.runId).catch(() => {});
    }
    run.limitResumeCycles = (run.limitResumeCycles ?? 0) + 1;
    run.status = "running";
    run.resumeAt = null;
    await this.writeAggregate(run);
    const project = await this.projectForRun(run);
    const cursor = run.currentStage ?? workflow.phases[0]?.id ?? null;
    const retries = new Map(Object.entries(run.retries ?? {}));
    this.log.info("auto-resumed limit-paused workflow run", {
      workflowRunId,
      phase: cursor,
      cycle: run.limitResumeCycles,
    });
    if (cursor) {
      const handoffSource = this.recomputeHandoff(run, workflow, cursor);
      // Phase 9.3: the resumed phase is a continuation — prefix it with what's already
      // done + committed so it doesn't re-implement completed work.
      const resumeContext = await this.composeResumeContext(
        run,
        workflow.phases.map((p) => p.id),
        {},
      );
      const traceId = this.trace.getTraceId() ?? randomUUID();
      void this.trace.run({ traceId, runId: workflowRunId }, () =>
        this.drive(run, workflow, project, { cursor, handoffSource, retries, resumeContext }),
      );
    }
    return run;
  }

  /**
   * Phase 9: park a limit-paused workflow run that flapped past `LIMIT_RESUME_MAX`.
   * Durable, operator-resumable (`parkedReason: "limit"`, re-enters at the parked
   * phase). Writes a short flap note as the parked surface and discards any stale
   * paused stage record.
   */
  async parkLimitFlapped(workflowRunId: string): Promise<WorkflowRun> {
    const run = this.runs.get(workflowRunId) ?? (await this.readAggregate(workflowRunId));
    if (!run) throw new WorkflowRunNotFoundError(workflowRunId);
    this.runs.set(workflowRunId, run);
    const phaseId = run.currentStage ?? run.stageRuns[run.stageRuns.length - 1]?.phaseId ?? "?";
    const cycles = run.limitResumeCycles ?? 0;
    const failureFile = path.join(run.cwd, `${phaseId}.limit.txt`);
    await fs
      .writeFile(
        failureFile,
        `Workflow "${run.workflowId}" paused on the usage limit; auto-resume flapped ${cycles} time(s) and was parked for review.\n`,
        "utf8",
      )
      .catch(() => {});
    for (const s of run.stageRuns) {
      if (s.status === "paused-limit") await this.core.discardPausedLimit(s.runId).catch(() => {});
    }
    run.status = "parked";
    run.parkedReason = "limit";
    run.parked = { phaseId, attempts: Math.max(1, cycles), failureFile };
    run.resumeAt = null;
    run.currentStage = phaseId;
    await this.writeAggregate(run);
    this.log.warn("workflow run parked after usage-limit flap", { workflowRunId, phaseId, cycles });
    return run;
  }

  /**
   * Phase 9: the absolute handoff a re-driven phase should consume — the `produces`
   * file of the nearest *upstream* phase that emits one. Used by limit-resume and the
   * limit-parking resume, which re-enter mid-workflow without the original drive's
   * in-memory `handoffSource`. Null when no upstream phase produces anything.
   */
  private recomputeHandoff(run: WorkflowRun, workflow: Workflow, cursor: string): string | null {
    const order = workflow.phases;
    const idx = order.findIndex((p) => p.id === cursor);
    for (let i = idx - 1; i >= 0; i--) {
      const ph = order[i];
      if (ph?.produces) {
        return path.join(run.cwd, this.latestStageDir(run, ph.id), ph.produces);
      }
    }
    return null;
  }

  list(): WorkflowRun[] {
    const cutoff = Date.now() - RETENTION_MS;
    const out: WorkflowRun[] = [];
    for (const [id, run] of this.runs) {
      // Parked runs stay in memory regardless of age: a retries-parked run may
      // sit for days and must remain resumable without a restart round-trip. A
      // `paused-limit` run (Phase 9) is the same — it must stay resumable by the tick.
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

  /** The full run history (on disk + in memory), newest first; no age cutoff. */
  async listAll(): Promise<WorkflowRun[]> {
    const byId = new Map<string, WorkflowRun>();
    const entries = await fs.readdir(this.dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const raw = await fs
        .readFile(path.join(this.dir, entry.name, AGGREGATE_FILE), "utf8")
        .catch(() => null);
      if (raw === null) continue;
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      const parsed = WorkflowRunSchema.safeParse(data);
      if (!parsed.success) continue;
      byId.set(parsed.data.workflowRunId, parsed.data);
    }
    // In-memory wins: it carries the live `currentStage`/`status` of an active run.
    for (const [id, run] of this.runs) byId.set(id, run);
    return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  get(workflowRunId: string): WorkflowRun {
    const run = this.runs.get(workflowRunId);
    if (!run) throw new WorkflowRunNotFoundError(workflowRunId);
    return run;
  }

  /**
   * Phase 43 — stop a running workflow run: kill its live stage child (reusing the
   * same {@link RunnerCore.cancel} the agent stop already uses) and flag the run so
   * `drive()` lands it `interrupted` on the kill's next turn, instead of retrying or
   * parking. Only a run that is `running` with a live stage owns a process to kill —
   * anything else (parked, paused-limit, already terminal) throws
   * {@link WorkflowRunNotStoppableError}. Fires the kill and returns immediately; the
   * kill's exit reconciles asynchronously (mirrors the agent stop's own timing).
   */
  async stop(workflowRunId: string): Promise<void> {
    const run = this.runs.get(workflowRunId);
    // A parent waiting on a running sub-run stops the child; the child's
    // `interrupted` re-enters the parent, which then lands `interrupted` too.
    if (run?.status === "running" && run.pendingChild) {
      this.stopRequested.add(workflowRunId);
      try {
        await this.stop(run.pendingChild.childRunId);
      } catch (error) {
        this.stopRequested.delete(workflowRunId);
        throw error;
      }
      return;
    }
    if (!run || run.status !== "running" || !run.currentStageRunId) {
      throw new WorkflowRunNotStoppableError(workflowRunId);
    }
    this.stopRequested.add(workflowRunId);
    try {
      this.core.cancel(run.currentStageRunId);
    } catch (error) {
      this.stopRequested.delete(workflowRunId);
      throw error;
    }
  }

  /**
   * Permanently delete a workflow run. Each stage spawned through the core writes
   * its sidecar/log to the *runs dir root* (not the stage cwd), so removing the run
   * folder alone would orphan them — delete every stage's artifacts first, then the
   * folder (aggregate + per-phase sandboxes). Throws if the run is unknown.
   */
  async delete(workflowRunId: string): Promise<void> {
    const run = this.runs.get(workflowRunId) ?? (await this.readAggregate(workflowRunId));
    if (!run) throw new WorkflowRunNotFoundError(workflowRunId);
    for (const stage of run.stageRuns) {
      // Escalation markers have no real run behind them; a missing sidecar is fine.
      await this.core.delete(stage.runId).catch(() => {});
    }
    this.runs.delete(workflowRunId);
    // An `output`-parked run owns a pending `workflow-output` approval keyed on this
    // workflowRunId — resolve it (rejected, not routed back) so the queue doesn't keep
    // a card for a run that no longer exists.
    await this.approvals.cancelPendingForRun(workflowRunId).catch(() => {});
    // Phase 3.1: drop the git worktree (and prune its metadata) BEFORE the folder
    // rm — rm-first would strand stale `.git/worktrees/*` in the project repo. The
    // branch is left intact (it may carry the PR). Best-effort; tolerant of a
    // worktree that's already gone.
    if (run.workspace && run.projectPath) {
      await this.workspace
        .removeWorktree({ projectPath: run.projectPath, worktreePath: run.workspace.path })
        .catch(() => {});
    }
    const root = this.resolveRunDir(workflowRunId);
    if (root) await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }

  /** Read a stage's log by phase id (the most recent attempt of that phase). */
  async readStageLog(workflowRunId: string, phaseId: string, offset: number): Promise<RunLogChunk> {
    // Fall back to the on-disk aggregate (like delete/readArtifact/resume): a finished
    // run is evicted from the in-memory registry once it ages past RETENTION_MS, but
    // its aggregate + per-stage logs persist — so the detail view can still tail them.
    const run = this.runs.get(workflowRunId) ?? (await this.readAggregate(workflowRunId));
    if (!run) throw new WorkflowRunNotFoundError(workflowRunId);
    // The in-flight stage isn't in `stageRuns` yet (that append is terminal-only),
    // so while this phase is the one executing, tail it by the live
    // `currentStageRunId` — that is the running attempt, not a stale earlier one.
    if (run.currentStage === phaseId && run.currentStageRunId) {
      return this.core.readLog(run.currentStageRunId, offset);
    }
    const stage = [...run.stageRuns].reverse().find((s) => s.phaseId === phaseId);
    if (!stage) throw new WorkflowRunNotFoundError(`${workflowRunId}/${phaseId}`);
    return this.core.readLog(stage.runId, offset);
  }

  /**
   * Subscribe to append signals for one stage's log — the push counterpart of
   * {@link readStageLog}. Each core append is filtered against the attempt read
   * would resolve *now* (the live `currentStageRunId` while the phase executes,
   * else a `stageRuns` entry of the phase), so a retry that swaps the attempt
   * keeps signalling without resubscription. Only in-flight runs append, so the
   * in-memory registry is the whole universe here (no aggregate fallback); an
   * unknown run simply never fires. Returns an unsubscribe for stream teardown.
   */
  onStageLogAppend(workflowRunId: string, phaseId: string, listener: () => void): () => void {
    return this.core.onLogAny((runId) => {
      const run = this.runs.get(workflowRunId);
      if (!run) return;
      const live = run.currentStage === phaseId && run.currentStageRunId === runId;
      const past = run.stageRuns.some((s) => s.phaseId === phaseId && s.runId === runId);
      if (live || past) listener();
    });
  }

  /**
   * Read one whitelisted run artifact (Phase 3.3) by name. `name` must be on the
   * global allowlist ({@link WORKFLOW_RUN_ARTIFACTS}, the delivery-loop's fixed
   * names), match the run's own delivered `file` output (a directed task's
   * `outputsOverride`'s `from`, falling back to the workflow definition's own
   * `outputs:`), or name anything any phase of THIS workflow declares via
   * `produces` — every agent phase requires one, so this is what lets a
   * non-delivery workflow shape (research, audit, …) hand its own artifacts back
   * out under their own names instead of only the delivery loop's. Anything else
   * (incl. any traversal attempt) returns null → 404; there is no generic file
   * browser. The diffstat lives in the run root; every other artifact is a
   * phase's `produces`, found in its stage sandbox. Returns null when the run is
   * unknown or the file is absent.
   */
  async readArtifact(
    workflowRunId: string,
    name: string,
  ): Promise<{ name: WorkflowRunArtifact["name"]; content: string } | null> {
    const root = this.resolveRunDir(workflowRunId);
    if (!root) return null;
    const run = this.runs.get(workflowRunId) ?? (await this.readAggregate(workflowRunId));
    const workflow = run ? await this.workflows.get(run.workflowId).catch(() => null) : null;
    const fileOutputName =
      run?.outputsOverride?.find((o) => o.type === "file")?.from ??
      workflow?.outputs?.find((o) => o.type === "file")?.from;
    const producedNames = new Set(
      workflow?.phases.map((p) => p.produces).filter((p): p is string => Boolean(p)) ?? [],
    );
    const isAllowed =
      (WORKFLOW_RUN_ARTIFACTS as readonly string[]).includes(name) ||
      name === fileOutputName ||
      producedNames.has(name);
    if (!isAllowed) return null;
    const allowed = name as WorkflowRunArtifact["name"];
    // Candidate dirs: the run root (diffstat.txt) + the phase sandboxes. The
    // currently-executing phase is included too — a run parked on the PR gate has
    // already written its `produces` (pr-draft.md) but is not yet in `stageRuns`
    // (that append happens only when the stage reaches a terminal state).
    // Traversal-guarded again via resolveInside, though the allowlist already rules
    // out separators.
    const phaseDirs = new Set<string>();
    if (run) {
      if (run.currentStage) {
        // The in-flight phase isn't in `stageRuns` yet (that append is
        // terminal-only), but its folder name is deterministic: the next sequence
        // number. Keep the bare phase id too as the pre-numbering fallback shape.
        phaseDirs.add(this.stageDirName(run.stageRuns.length + 1, run.currentStage));
        phaseDirs.add(run.currentStage);
      }
      // One candidate per phase: the folder of its LATEST run (numbered when
      // recorded, the old flat phase id for pre-numbering records).
      for (const s of run.stageRuns) phaseDirs.add(this.latestStageDir(run, s.phaseId));
    }
    const dirs = [root, ...[...phaseDirs].map((id) => path.join(root, id))];
    for (const dir of dirs) {
      const file = this.resolveInside(dir, allowed);
      if (!file) continue;
      const content = await fs.readFile(file, "utf8").catch(() => null);
      if (content !== null) return { name: allowed, content };
    }
    return null;
  }

  /**
   * Read the most meaningful artifact a finished run left behind, without a fixed
   * name list — the nightly memory distiller's read-side counterpart to every
   * workflow shape, not only the delivery loop. Tries each phase's `produces` in
   * REVERSE order (latest phase first, since that's usually the workflow's real
   * deliverable) via {@link readArtifact}, falling through to earlier phases when a
   * later one is missing or empty. Returns null when the workflow can't be
   * resolved or no phase left readable content.
   */
  async readLatestArtifact(
    workflowRunId: string,
  ): Promise<{ name: string; content: string } | null> {
    const run = this.runs.get(workflowRunId) ?? (await this.readAggregate(workflowRunId));
    const workflow = run ? await this.workflows.get(run.workflowId).catch(() => null) : null;
    if (!workflow) return null;
    const names = [...workflow.phases]
      .reverse()
      .map((p) => p.produces)
      .filter((p): p is string => Boolean(p));
    for (const name of names) {
      const artifact = await this.readArtifact(workflowRunId, name);
      if (artifact?.content.trim()) return artifact;
    }
    return null;
  }

  /**
   * Drive the phases in order. The cursor moves forward on success; on failure it
   * either takes the phase's back-edge (bounded by `maxRetries`) or fails the run.
   */
  private async drive(
    run: WorkflowRun,
    workflow: Workflow,
    project: Project | null = null,
    resume?: {
      cursor: string;
      handoffSource: string | null;
      retries: Map<string, number>;
      /** Phase 9.3: resume-context for the FIRST re-driven phase (limit/parked resume). */
      resumeContext?: string;
      /** The settled stage of the `workflow` phase at `cursor` (its sub-run finished). */
      child?: StageRun;
    },
  ): Promise<void> {
    const byId = new Map(workflow.phases.map((p) => [p.id, p]));
    const order = workflow.phases;
    const phaseIds = order.map((p) => p.id);
    // The curated delegation catalog for every stage of this run: the agents THIS
    // workflow actually uses. Passing the whole agent library into `--agents` would
    // overflow the OS argv limit (spawn E2BIG); a stage may still delegate within its
    // own workflow's roster (plus ZIBBY's operational core, folded in downstream).
    const delegates = order.map((p) => p.agent).filter((a): a is string => Boolean(a));
    const retries = resume?.retries ?? new Map<string, number>();
    // Absolute path of the file to feed into the next phase's `consumes` input.
    let handoffSource: string | null = resume?.handoffSource ?? null;
    let cursor: string | null = resume?.cursor ?? order[0]?.id ?? null;
    // Phase 9.3: a continuation prefix for the next phase to run — set on a re-driven
    // resume (limit/parked) and on a loop back-edge; consumed once, then cleared.
    let pendingResumeContext: string | null = resume?.resumeContext ?? null;
    // A sub-run that just settled is recorded first, before any boundary check could
    // park the run and lose it; consumed by the first iteration only.
    let settledChild: StageRun | undefined = resume?.child;

    while (cursor) {
      const phase = byId.get(cursor);
      if (!phase) break; // defensive; superRefine guarantees targets exist
      run.currentStage = phase.id;
      const settled = settledChild?.phaseId === phase.id ? settledChild : undefined;
      settledChild = undefined;

      // Phase 9 (boundary pause, decision 3b): before spending a stage, halt if the
      // usage window is exhausted — persist the aggregate `paused-limit` with the
      // earliest reset as `resumeAt` and return without spawning. Auto-resume re-drives
      // from this same cursor. Fail-open: a stale/headroom reading just proceeds, and a
      // wrongly-dispatched stage that dies on a limit is caught by the mid-stage path.
      const boundary = await this.limits.windowExhausted();
      if (!settled && boundary.exhausted) {
        run.status = "paused-limit";
        run.resumeAt = boundary.resumeAt ?? (await this.limits.resolveResumeAt(null));
        run.limitResumeCycles = run.limitResumeCycles ?? 0;
        run.retries = Object.fromEntries(retries);
        await this.writeAggregate(run);
        await this.writeProgress(run, phaseIds);
        this.log.warn("workflow run paused on usage limit (phase boundary)", {
          phase: phase.id,
          resumeAt: run.resumeAt,
        });
        return;
      }

      // P1-03: the spend cap is checked at the boundary too — after the stage that
      // crossed it, before the next one spends more. Parks durably on a gate approval.
      if (!settled && run.budget && run.budget.spentUsd > run.budget.maxCostUsd) {
        const lastPhaseId = run.stageRuns[run.stageRuns.length - 1]?.phaseId ?? phase.id;
        await this.parkAtGate(run, "budget", {
          phaseId: lastPhaseId,
          cursor: phase.id,
          handoffSource,
          retries,
          phaseIds,
          approval: {
            skill: workflow.name ?? workflow.id,
            action: "spend-past-cap",
            detail: `Workflow "${run.workflowId}" spent $${run.budget.spentUsd.toFixed(2)} of its $${run.budget.maxCostUsd.toFixed(2)} cap before phase "${phase.id}". Approve to continue with the cap raised by another $${run.budget.maxCostUsd.toFixed(2)}; reject to fail the run.`,
            risk: "medium",
            department: workflow.department,
          },
        });
        return;
      }

      const attempt = (retries.get(phase.id) ?? 0) + 1;

      // D-015: an `agent` phase's dispatch is an employee (a hired instance of
      // `phase.agent`, the position), leased from the workflow's OWN department.
      // Acquiring here — before the sandbox exists — means a `no-employee` park
      // never leaves a half-built stage folder behind. When every matching employee
      // is busy the stage waits RANKED (progress → project round-robin → FIFO)
      // behind other waiters on the same department+position; the run stays
      // `running` with `waitingForStaff` on disk for the whole wait (decision 7).
      // The lease comes BEFORE the machine-fuse slot taken right before `runStage`,
      // so a staff wait holds nothing. A `verify` phase spawns no agent, so it never
      // acquires (`phase.agent` is absent for it).
      const rank = {
        progress: this.progressOf(run, phaseIds, phase.id),
        projectId: project?.id,
      };
      let lease: EmployeeLease | undefined;
      if (phase.agent && workflow.department) {
        try {
          const ctx = { runId: run.workflowRunId, rank };
          lease =
            (await this.employees.tryAcquire(workflow.department, phase.agent, ctx)) ?? undefined;
          if (!lease) {
            run.waitingForStaff = {
              department: workflow.department,
              agentId: phase.agent,
              since: new Date().toISOString(),
            };
            await this.writeAggregate(run);
            lease = await this.employees.acquire(workflow.department, phase.agent, ctx);
            run.waitingForStaff = undefined;
            await this.writeAggregate(run);
          }
        } catch (error) {
          if (!(error instanceof NoEmployeeError)) {
            // A throw after the grant (the clear-and-write) must not leak the lease.
            if (lease) this.employees.release(lease);
            throw error;
          }
          run.waitingForStaff = undefined;
          run.status = "parked";
          run.parkedReason = "no-employee";
          run.currentStage = phase.id;
          run.retries = Object.fromEntries(retries);
          await this.writeAggregate(run);
          await this.writeProgress(run, phaseIds);
          this.log.warn("workflow run parked (no employee of this position)", {
            phase: phase.id,
            department: workflow.department,
            agent: phase.agent,
          });
          return;
        }
      }

      // Sequential sandbox numbering: every dispatch appends exactly one `stageRuns`
      // entry when it settles (there is no same-entry retry path in this machine),
      // so `length + 1` numbers the folders in call order — a loop back-edge's
      // second run of the same phase gets its own folder instead of overwriting the
      // first. A synthetic escalation marker also occupies a slot, which leaves a
      // gap in the numbering, never a clash.
      const stageDir = settled?.dir ?? this.stageDirName(run.stageRuns.length + 1, phase.id);
      const stageCwd = path.join(run.cwd, stageDir);
      if (!settled) {
        try {
          await this.prepareStageDir(run, stageCwd, handoffSource, phase);
        } catch (error) {
          if (lease) this.employees.release(lease); // not yet under runStage's finally
          throw error;
        }
      }

      this.log.info("workflow phase starting", {
        phase: phase.id,
        type: phase.type,
        agent: phase.agent,
        attempt,
      });
      const stageResumeContext = pendingResumeContext ?? undefined;
      pendingResumeContext = null; // consumed by this phase only
      let stageRun: StageRun;
      if (phase.type === "workflow") {
        // A sub-run: the parent waits durably (`pendingChild`); the driver returns and
        // re-enters this phase via onChildStatus once the child settles.
        const refused =
          settled ??
          (await this.startChild(
            run,
            phase,
            stageDir,
            attempt,
            handoffSource,
            retries,
            phaseIds,
            project,
          ));
        if (!refused) return;
        stageRun = refused;
      } else {
        // Machine fuse (decision 2): a slot per spawned agent process, taken after the
        // lease (a fuse wait briefly holds the employee) and released after it.
        let slot: FuseSlot | undefined;
        try {
          if (phase.agent) slot = await this.fuse.take(rank);
          stageRun = await this.runStage(
            run,
            phase,
            stageCwd,
            attempt,
            project,
            stageResumeContext,
            delegates,
            lease,
          );
        } finally {
          // Released on EVERY terminal path (done/error/interrupted/paused-limit) —
          // `runStage` only returns once `waitForStage` sees one of those, so the
          // lease never outlives the dispatch it was acquired for. Lease first, then slot.
          if (lease) this.employees.release(lease);
          slot?.();
        }
      }
      // The stage has reached a terminal/paused state and (when terminal) is about
      // to be appended to `stageRuns` — its log is readable from there now, so drop
      // the live pointer the running attempt used.
      run.currentStageRunId = undefined;

      // Phase 43: an operator-requested stop killed this stage's child — land the
      // aggregate `interrupted` right here, before any retry/park/limit logic runs,
      // so a stopped run never respawns a retry attempt or drops into a pause.
      // Shutdown killed the stage: record it and stop driving — the boot
      // reconciliation settles the aggregate, no retry is spent on a dying process.
      if (this.shuttingDown) {
        run.stageRuns.push(stageRun);
        await this.writeAggregate(run);
        return;
      }

      if (this.stopRequested.delete(run.workflowRunId)) {
        run.stageRuns.push(stageRun);
        run.status = "interrupted";
        run.currentStage = null;
        await this.writeAggregate(run);
        await this.writeProgress(run, phaseIds);
        this.log.info("workflow run stopped (operator)", {
          phase: phase.id,
          workflowRunId: run.workflowRunId,
        });
        return;
      }

      // Phase 9 (mid-stage pause, decision 3a): the stage child died on a usage limit.
      // The aggregate pauses WITHOUT touching the retry map — loop budget and the
      // escalation ladder are left exactly where they were, so the pause costs nothing.
      // `resumeAt` is copied up from the paused stage record. The driver returns; the
      // auto-resume path re-enters at this same phase (with resume-context, Phase 9.3).
      if (stageRun.status === "paused-limit") {
        run.stageRuns.push(stageRun);
        run.status = "paused-limit";
        run.currentStage = phase.id;
        const stageRec = this.core.get(stageRun.runId);
        run.resumeAt = stageRec.resumeAt ?? (await this.limits.resolveResumeAt(null));
        run.limitResumeCycles = run.limitResumeCycles ?? 0;
        run.retries = Object.fromEntries(retries);
        await this.writeAggregate(run);
        await this.writeProgress(run, phaseIds);
        this.log.warn("workflow run paused on usage limit (mid-stage)", {
          phase: phase.id,
          resumeAt: run.resumeAt,
        });
        return;
      }
      // A rejected approval lands here with the aggregate still "parked" (the
      // cancel path flips only the stage) — un-park before recording the outcome.
      if (run.status === "parked") {
        run.status = "running";
        delete run.parkedReason;
      }
      // P1-03: external (non-model) cost the stage reported + the run's running spend.
      await this.accrueStageCost(run, stageRun, stageCwd);
      run.stageRuns.push(stageRun);
      this.updateSpend(run);
      // A finished verify phase leaves runner-captured evidence (real exit code + the
      // HEAD it checked) — the dev → rel PR gate in openPrOutput reads it, fail-closed.
      if (phase.type === "verify" && (stageRun.status === "done" || stageRun.status === "error")) {
        const sha = run.workspace
          ? await this.workspace.headSha(run.workspace.path).catch(() => undefined)
          : undefined;
        run.verifyEvidence = {
          phaseId: phase.id,
          stageRunId: stageRun.runId,
          commands: resolveVerifyChecks({
            commands: phase.commands,
            projectChecks: project?.checks,
          }),
          exitCode: this.core.get(stageRun.runId)?.exitCode ?? null,
          ...(sha ? { sha } : {}),
          cleanCheckout: phase.checkout === "clean" && !!run.workspace,
          at: new Date().toISOString(),
        };
      }
      await this.writeAggregate(run);

      // Phase 45: a `qualify` agent phase that ran clean is graded on the verdict it
      // wrote into its artifact. pass advances; gap/drift/absent take the back-edge
      // (fail-closed). The verdict is recorded on the stage for surfacing + activity.
      let qualifyFail: { verdict: StageVerdict } | null = null;
      if (stageRun.status === "done" && phase.qualify && phase.produces) {
        const artifact = await fs
          .readFile(path.join(stageCwd, phase.produces), "utf8")
          .catch(() => "");
        const verdict = parseStageVerdict(artifact) ?? "gap"; // fail-closed
        stageRun.verdict = verdict;
        await this.writeAggregate(run); // surface the verdict on the live timeline at once
        await this.activity.record({
          kind: "stage-verdict",
          summary: `qualify "${phase.id}" → ${verdict}`,
          refs: { workflowId: run.workflowId, status: verdict },
        });
        if (verdict !== "pass") qualifyFail = { verdict };
      }

      if (stageRun.status === "done" && !qualifyFail) {
        this.log.info("workflow phase done", { phase: phase.id, attempt });
        // Phase 12.6: a `verify` phase passed → record the commands it ran (runner-set
        // from real execution, not an agent claim) so a goal maker can skip an identical
        // second verification (goal-runner.makerAlreadyVerified).
        if (phase.type === "verify") {
          run.verifyCommands = resolveVerifyChecks({
            commands: phase.commands,
            projectChecks: project?.checks,
          });
        }
        // Phase 9.3: checkpoint the green phase on the run branch (worktree only;
        // a clean tree / non-git run → no-op). Records the sha on the aggregate.
        // checkpointPhase only READS `phase.produces` (for the commit summary's first
        // line) and commits the WORKTREE, a separate tree from this stage's sandbox —
        // it never writes the produces file, so ordering the chmod after it is safe
        // either way; kept after regardless, per the plan's conservative default.
        // Not after `verify`: checks transform nothing, and committing files they left
        // behind would move HEAD past the verified sha and block the PR.
        if (phase.type !== "verify") await this.checkpointPhase(run, phase, stageCwd, attempt);
        // P1-T2: the produces file is now final for this dispatch — make it read-only
        // so a later phase can't corrupt it retroactively through the symlink handoff
        // (each retry/loop dispatch gets its own fresh numbered folder, so this never
        // blocks re-generating the artifact on a subsequent attempt).
        if (phase.produces) {
          await fs.chmod(path.join(stageCwd, phase.produces), 0o444).catch(() => {
            // A missing produces file (a phase that declared one but didn't write it)
            // is not fatal here — nothing to protect.
          });
        }
        // A verify phase transforms nothing: it leaves the handoff untouched, so
        // the next phase consumes the last *producing* phase's output.
        if (phase.produces) handoffSource = path.join(stageCwd, phase.produces);
        const idx = order.findIndex((p) => p.id === phase.id);
        cursor = order[idx + 1]?.id ?? null;
        await this.writeProgress(run, phaseIds);
        // P1-02: an operator checkpoint after this phase — park on the finished
        // artifact; approve re-enters at `cursor` (or delivers the outputs).
        if (phase.approval === "ask") {
          const producesPath = phase.produces ? path.join(stageCwd, phase.produces) : stageCwd;
          await this.parkAtGate(run, "gate", {
            phaseId: phase.id,
            cursor,
            handoffSource,
            retries,
            phaseIds,
            approval: {
              skill: workflow.name ?? workflow.id,
              action: "stage-approval",
              detail: `Workflow "${run.workflowId}", phase "${phase.id}" finished — review ${producesPath} and approve to continue (reject fails the run).`,
              risk: "low",
              department: workflow.department,
            },
          });
          return;
        }
        continue;
      }

      // Stage failed, was interrupted, OR a qualify phase returned gap/drift.
      const loop = phase.loop;
      // drift re-plans (Architekt) via driftTo; gap / a real error fix in place (Kodér).
      const retryTarget = qualifyFail?.verdict === "drift" ? (loop?.driftTo ?? loop?.to) : loop?.to;
      if (loop && (retries.get(phase.id) ?? 0) < loop.maxRetries) {
        retries.set(phase.id, (retries.get(phase.id) ?? 0) + 1);
        this.log.warn("workflow phase failed; retrying", {
          phase: phase.id,
          status: stageRun.status,
          verdict: qualifyFail?.verdict,
          attempt,
          retryTo: retryTarget,
        });
        handoffSource = await this.writeFailureContext(run, phase, stageRun);
        // Phase 9.3: the retried phase is a continuation — prefix it with the
        // resume-context (what's committed so far + this attempt's failure tail).
        // Phase 45: a qualify verdict carries WHY into that handoff so Kodér/Architekt
        // learn what the gate found, not just that they were re-dispatched.
        pendingResumeContext = await this.composeResumeContext(run, phaseIds, {
          failureTail: qualifyFail
            ? `verdict=${qualifyFail.verdict}\n${await this.tailLog(stageRun.runId)}`
            : await this.tailLog(stageRun.runId),
        });
        cursor = retryTarget!;
        await this.writeProgress(run, phaseIds);
        continue;
      }

      // Retries exhausted with `then: "park"`: durable parking — no synthetic
      // error marker (the parked detail is the surface), no failed status. The
      // driver exits; {@link resumeParked} re-enters this machine with a note.
      if (loop?.then === "park") {
        const failureFile = await this.writeFailureContext(run, phase, stageRun);
        run.status = "parked";
        run.parkedReason = "retries";
        run.parked = { phaseId: phase.id, attempts: attempt, failureFile };
        run.retries = Object.fromEntries(retries);
        run.currentStage = phase.id;
        await this.writeAggregate(run);
        await this.writeProgress(run, phaseIds);
        this.log.warn("workflow run parked (retries exhausted)", {
          phase: phase.id,
          attempts: attempt,
        });
        return;
      }

      // No loop, or retries exhausted: escalate (surface), then fall through.
      if (loop?.escalate) {
        this.log.warn("workflow phase escalated (retries exhausted)", { phase: phase.id, attempt });
        run.stageRuns.push({
          phaseId: phase.id,
          runId: `${run.workflowRunId}.${phase.id}.escalated`,
          attempt,
          status: "error",
        });
      }
      if (!loop || loop.then === "fail") {
        this.log.error("workflow phase failed; failing run", {
          phase: phase.id,
          status: stageRun.status,
        });
        run.status = "failed";
        cursor = null;
      } else {
        handoffSource = await this.writeFailureContext(run, phase, stageRun);
        cursor = loop.then;
      }
    }

    if (run.status === "running") {
      // Chain finished green — hand off to the workflow's delivery sinks. A `pr`
      // output parks the run on the PR gate; the run only reaches `done` once every
      // output is delivered (handled inside runOutputs).
      await this.runOutputs(run, workflow, 0, phaseIds);
      return;
    }
    run.currentStage = null;
    await this.writeAggregate(run);
    await this.writeProgress(run, phaseIds);
    this.log.info("workflow run finished", { status: run.status, stages: run.stageRuns.length });
  }

  /**
   * Deliver the workflow's outputs (terminal sinks) starting at `from`. `file` sinks
   * run immediately (deterministic, Tier-1); a `pr` sink opens the PR immediately too
   * (Tier-2 — act-then-report, no gate) and records its url + line totals on the run.
   * Once every output is delivered the run finishes `done`. Outputs are post-chain
   * delivery: a failed sink is logged, never fails the (already-green) run — the branch
   * work is committed and safe.
   */
  private async runOutputs(
    run: WorkflowRun,
    workflow: Workflow,
    from: number,
    phaseIds: string[],
  ): Promise<void> {
    const outputs = run.outputsOverride ?? workflow.outputs ?? [];
    for (let i = from; i < outputs.length; i++) {
      const output = outputs[i];
      if (!output) continue;
      if (output.type === "pr") {
        if (!(await this.openPrOutput(run, workflow, output)))
          return this.failBlockedPr(run, phaseIds);
        continue;
      }
      if (output.type === "folder") {
        await this.deliverFolderOutput(run, output);
        continue;
      }
      await this.deliverFileOutput(run, workflow, output);
    }
    run.status = "done";
    run.currentStage = null;
    await this.writeAggregate(run);
    await this.writeProgress(run, phaseIds);
    this.log.info("workflow run finished", { status: run.status, stages: run.stageRuns.length });
  }

  /**
   * Project a directed task's output choice onto this workflow's sink array. A task
   * carries no `from` (the workflow owns its handoff names), so the source is the
   * workflow's terminal artifact — the last phase that `produces` anything (falling
   * back to a conventional name when the workflow produces nothing, in which case a
   * `pr` sink simply has no body to read and titles off the workflow id). `void` →
   * `[]` (deliver nothing, suppressing even a declared PR).
   */
  private toOutputsOverride(taskOutput: TaskOutput, workflow: Workflow): WorkflowOutput[] {
    if (taskOutput.type === "void") return [];
    const from = [...workflow.phases].reverse().find((p) => p.produces)?.produces ?? "result.md";
    if (taskOutput.type === "pr") return [{ type: "pr", from }];
    return [{ type: "file", from, dest: taskOutput.dest, to: taskOutput.to }];
  }

  /**
   * `NN_<phaseId>` sandbox folder name for the run's `seq`-th stage dispatch —
   * zero-padded to 2 digits; a >99th dispatch simply widens the number.
   */
  private stageDirName(seq: number, phaseId: string): string {
    return `${String(seq).padStart(2, "0")}_${phaseId}`;
  }

  /**
   * Folder name (under the run root) holding the LATEST run of `phaseId` — the
   * newest `stageRuns` record that carries a `dir`. Records without one are
   * skipped: a synthetic escalation marker owns no folder, and a pre-numbering
   * record's folder is the bare phase id — which is also the right answer when no
   * numbered record exists, so one fallback covers both (backcompat with runs on
   * disk that predate sequential numbering).
   */
  private latestStageDir(run: WorkflowRun, phaseId: string): string {
    for (let i = run.stageRuns.length - 1; i >= 0; i--) {
      const s = run.stageRuns[i];
      if (s?.phaseId === phaseId && s.dir) return s.dir;
    }
    return phaseId;
  }

  /**
   * Absolute path of the artifact a `from` references. P1-T3 (Fáze 4): `output/`
   * is the run's canonical, already-materialized delivery source — every caller
   * (file sink, PR park, PR open) just reads `output/<fromName>`. The first read
   * of a given `from` in a run lazily links it in (relative symlink, same style as
   * `placeHandoff`/P1-T2) from the producing phase's latest folder; every read
   * after that is a plain path join, no phase search. Backcompat: a run on disk
   * from before this change has no `output/` dir at all — falls back whole to the
   * original phase-search lookup.
   */
  private async resolveOutputSource(
    run: WorkflowRun,
    workflow: Workflow,
    fromName: string,
  ): Promise<string | null> {
    const outputDir = path.join(run.cwd, "output");
    const hasOutputDir = await fs
      .stat(outputDir)
      .then((s) => s.isDirectory())
      .catch(() => false);
    if (!hasOutputDir) {
      // Pre-P1-T3 run on disk: no output/ dir was ever created for it — the
      // original lookup (search phases by `produces`, then the latest folder).
      const phase = workflow.phases.find((p) => p.produces === fromName);
      if (!phase) return null;
      return path.join(run.cwd, this.latestStageDir(run, phase.id), fromName);
    }
    const dest = path.join(outputDir, fromName);
    const alreadyLinked = await fs
      .lstat(dest)
      .then(() => true)
      .catch(() => false);
    if (!alreadyLinked) {
      const phase = workflow.phases.find((p) => p.produces === fromName);
      if (phase) {
        const source = path.join(run.cwd, this.latestStageDir(run, phase.id), fromName);
        await fs.symlink(path.relative(outputDir, source), dest).catch(() => {
          // Missing source (the phase never actually wrote `produces`) isn't fatal —
          // the caller's `readFile` below fails the same soft way it always has.
        });
      }
    }
    return dest;
  }

  /** Split a Markdown artifact into a PR title (first `# ` heading) and the body. */
  private parsePrMarkdown(content: string): { title: string; body: string } {
    const lines = content.split(/\r?\n/);
    const headingIdx = lines.findIndex((l) => /^#\s+/.test(l.trim()));
    if (headingIdx >= 0) {
      const heading = lines[headingIdx] ?? "";
      return {
        title: heading.replace(/^#\s+/, "").trim(),
        body: lines
          .slice(headingIdx + 1)
          .join("\n")
          .trim(),
      };
    }
    const firstLine = lines.find((l) => l.trim().length > 0)?.trim() ?? "";
    return { title: firstLine, body: content.trim() };
  }

  /** Deliver a `file` output: write the source artifact into the project or the vault. */
  private async deliverFileOutput(
    run: WorkflowRun,
    workflow: Workflow,
    output: Extract<WorkflowOutput, { type: "file" }>,
  ): Promise<void> {
    const source = await this.resolveOutputSource(run, workflow, output.from);
    const content = source ? await fs.readFile(source, "utf8").catch(() => null) : null;
    if (content === null) {
      this.log.warn("file output skipped — source artifact missing", {
        workflowRunId: run.workflowRunId,
        from: output.from,
      });
      return;
    }
    if (output.dest === "vault") {
      // A durable second-brain artifact. Replace on re-delivery (idempotent re-run).
      const delivered = await this.vault
        .createNote({ id: output.to, tier: "knowledge", body: content })
        .then(() => true)
        .catch(async (error) => {
          if (error instanceof DuplicateNoteError) {
            return this.vault
              .updateNote(output.to, { body: content })
              .then(() => true)
              .catch(() => false);
          }
          this.log.warn("vault file output failed (soft)", {
            workflowRunId: run.workflowRunId,
            to: output.to,
            err: error instanceof Error ? error.message : String(error),
          });
          return false;
        });
      if (delivered) {
        this.log.info("file output delivered to vault", {
          workflowRunId: run.workflowRunId,
          to: output.to,
        });
        await this.recordArtifact(run, "vault-note", output.from, output.to);
      }
      return;
    }
    // dest: project — write into the run's worktree (rides the zibby/* branch) or,
    // failing that, the project checkout. No project resolved → nowhere to write.
    const base = run.workspace?.path ?? run.projectPath;
    if (!base) {
      this.log.warn("project file output skipped — run has no project/worktree", {
        workflowRunId: run.workflowRunId,
        to: output.to,
      });
      return;
    }
    const dest = this.resolveInside(base, output.to);
    if (!dest) {
      this.log.warn("project file output skipped — destination escapes the project", {
        workflowRunId: run.workflowRunId,
        to: output.to,
      });
      return;
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, content, "utf8");
    this.log.info("file output delivered to project", {
      workflowRunId: run.workflowRunId,
      to: output.to,
    });
    await this.recordArtifact(run, "project-file", output.from, output.to);
  }

  /**
   * Deliver a `folder` output: copy `<run.cwd>/<from>` recursively into
   * `<to>/<workflowRunId>/` (`~` expands to the home dir). Soft like every sink.
   */
  private async deliverFolderOutput(
    run: WorkflowRun,
    output: Extract<WorkflowOutput, { type: "folder" }>,
  ): Promise<void> {
    const src = this.resolveInside(run.cwd, output.from);
    if (!src) {
      this.log.warn("folder output skipped — source escapes the run dir", {
        workflowRunId: run.workflowRunId,
        from: output.from,
      });
      return;
    }
    const isDir = await fs
      .stat(src)
      .then((s) => s.isDirectory())
      .catch(() => false);
    if (!isDir) {
      this.log.warn("folder output skipped — source folder missing", {
        workflowRunId: run.workflowRunId,
        from: output.from,
      });
      return;
    }
    const base =
      output.to === "~" || output.to.startsWith("~/")
        ? path.join(os.homedir(), output.to.slice(1))
        : output.to;
    const dest = path.join(base, run.workflowRunId);
    try {
      await fs.mkdir(dest, { recursive: true });
      await fs.cp(src, dest, { recursive: true });
    } catch (error) {
      this.log.warn("folder output failed (soft)", {
        workflowRunId: run.workflowRunId,
        to: dest,
        err: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    this.log.info("folder output delivered", { workflowRunId: run.workflowRunId, to: dest });
    await this.recordArtifact(run, "project-file", output.from, dest);
  }

  /**
   * Write the durable provenance record for a delivered output (N2a). Best-effort
   * by contract — the registry must never fail an (already-green) delivery; a
   * write error is logged and the delivery stands. Stable id ⇒ an idempotent
   * re-delivery replaces its record instead of duplicating it.
   *
   * A3 / TODO 13: when the owning department is in {@link ARTIFACT_SIGNALS}
   * (`rnd` → `research-artifact`, `qa` → `qa-findings`), ALSO hands a signal to the
   * signal bus — same best-effort contract, an emission must never fail an
   * already-green delivery. Every other owner is completely unaffected.
   */
  private async recordArtifact(
    run: WorkflowRun,
    kind: ArtifactKind,
    from: string,
    locator: string,
  ): Promise<void> {
    const project = await this.projectForRun(run).catch((): Project | null => null);
    const projectId = project && project.id !== "unregistered" ? project.id : undefined;
    const artifactId = artifactRecordId(run.workflowRunId, kind, from);
    await this.artifacts
      .record({
        id: artifactId,
        kind,
        locator,
        from,
        producedBy: {
          runRef: run.workflowRunId,
          workflowId: run.workflowId,
          ...(run.taskId ? { taskId: run.taskId } : {}),
          ...(projectId ? { projectId } : {}),
        },
        createdAt: new Date().toISOString(),
      })
      .catch((error) => {
        this.log.warn("artifact record failed (soft) — delivery stands", {
          workflowRunId: run.workflowRunId,
          from,
          err: error instanceof Error ? error.message : String(error),
        });
      });

    const owner = (await this.workflows.get(run.workflowId).catch(() => null))?.department;
    const signal = owner ? ARTIFACT_SIGNALS[owner] : undefined;
    if (owner && signal) {
      try {
        await this.signalBus.emit({
          from: owner,
          kind: signal.kind,
          ...(projectId ? { projectId } : {}),
          title: `${signal.title} ${from}`,
          body: `Delivered ${kind} ${locator}. ${signal.ask}`,
          fingerprint: artifactId,
        });
      } catch (error) {
        // `emit` is itself fail-open, but a signal emission must NEVER fail an
        // already-green delivery — same contract as the artifact record above.
        this.log.warn("artifact signal failed (soft) — delivery stands", {
          workflowRunId: run.workflowRunId,
          from,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * P1-02/P1-03: park the run durably at a phase boundary and raise a
   * `workflow-gate` approval keyed by the workflowRunId. No live child — the
   * aggregate carries everything {@link resumeGate} needs, so it survives a restart.
   */
  private async parkAtGate(
    run: WorkflowRun,
    reason: "gate" | "budget",
    at: {
      phaseId: string;
      cursor: string | null;
      handoffSource: string | null;
      retries: Map<string, number>;
      phaseIds: string[];
      approval: {
        skill: string;
        action: string;
        detail: string;
        risk: "low" | "medium" | "high";
        department?: DepartmentId;
      };
    },
  ): Promise<void> {
    run.status = "parked";
    run.parkedReason = reason;
    run.pendingGate = { phaseId: at.phaseId, cursor: at.cursor, handoffSource: at.handoffSource };
    run.currentStage = at.cursor;
    run.retries = Object.fromEntries(at.retries);
    await this.writeAggregate(run);
    await this.writeProgress(run, at.phaseIds);
    const { department, ...approval } = at.approval;
    await this.approvals.requestApproval({
      runId: run.workflowRunId,
      kind: "workflow-gate",
      ...approval,
      ...(department ? { department } : {}),
    });
    this.log.info("workflow run parked at a gate", {
      workflowRunId: run.workflowRunId,
      reason,
      phase: at.phaseId,
      next: at.cursor,
    });
  }

  /**
   * Continue (approve) or fail (reject) a run parked by {@link parkAtGate}. A budget
   * approval raises the cap by another `maxCostUsd` before re-entering. `revised`
   * ("request changes" on a stage checkpoint) re-runs the gated phase itself with
   * the operator's note as its resume-context — the phase lands green again and
   * parks at the same gate, so the operator reviews the reworked output. Never throws.
   */
  private async resumeGate(
    workflowRunId: string,
    decision: "approved" | "rejected" | "revised",
    note?: string,
  ): Promise<void> {
    try {
      const run = this.runs.get(workflowRunId) ?? (await this.readAggregate(workflowRunId));
      const gate = run?.pendingGate;
      if (!run || run.status !== "parked" || !gate) {
        this.log.warn("gate resume skipped (run not gate-parked)", { workflowRunId, decision });
        return;
      }
      this.runs.set(run.workflowRunId, run);
      const workflow = await this.workflows.get(run.workflowId);
      const phaseIds = workflow.phases.map((p) => p.id);
      const reason = run.parkedReason;
      delete run.parkedReason;
      delete run.pendingGate;
      if (decision === "rejected") {
        run.status = "failed";
        run.currentStage = null;
        await this.writeAggregate(run);
        await this.writeProgress(run, phaseIds);
        this.log.info("gate rejected — run failed", { workflowRunId, reason });
        return;
      }
      if (decision === "revised" && reason === "gate") {
        // Durable trace of the change request next to the run (files are truth).
        await fs
          .appendFile(
            path.join(run.cwd, `${gate.phaseId}.note.md`),
            `${(note ?? "").trim()}\n\n`,
            "utf8",
          )
          .catch(() => {});
        const retries = new Map(Object.entries(run.retries ?? {}));
        // An operator-requested rework is not a failed attempt — give the phase's
        // own loop a fresh budget so its qualify back-edge can still fire.
        retries.set(gate.phaseId, 0);
        run.status = "running";
        run.currentStage = gate.phaseId;
        await this.writeAggregate(run);
        const project = await this.projectForRun(run);
        const resumeContext = await this.composeResumeContext(run, phaseIds, {
          note: `${(note ?? "").trim()}\n\nThe operator reviewed your previous output and sent it back with the change request above. It is authoritative: apply exactly what it asks.`,
        });
        const traceId = this.trace.getTraceId() ?? randomUUID();
        void this.trace.run({ traceId, runId: workflowRunId }, () =>
          this.drive(run, workflow, project, {
            cursor: gate.phaseId,
            handoffSource: this.recomputeHandoff(run, workflow, gate.phaseId),
            retries,
            resumeContext,
          }),
        );
        return;
      }
      if (reason === "budget" && run.budget) {
        run.budget = {
          ...run.budget,
          maxCostUsd: run.budget.spentUsd + run.budget.maxCostUsd,
          warned: false,
        };
      }
      run.status = "running";
      await this.writeAggregate(run);
      if (gate.cursor === null) {
        await this.runOutputs(run, workflow, 0, phaseIds);
        return;
      }
      const project = await this.projectForRun(run);
      const retries = new Map(Object.entries(run.retries ?? {}));
      const traceId = this.trace.getTraceId() ?? randomUUID();
      void this.trace.run({ traceId, runId: workflowRunId }, () =>
        this.drive(run, workflow, project, {
          cursor: gate.cursor as string,
          handoffSource: gate.handoffSource,
          retries,
        }),
      );
    } catch (error) {
      this.log.error("gate resume failed", {
        workflowRunId,
        decision,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * P1-03: sum the `costUsd` of every line in `<stageDir>/costs.jsonl` (written by
   * tools that pay for something outside the model, e.g. a cloud image API) onto the
   * stage record. A missing file is zero; a malformed line is skipped, not fatal.
   */
  private async accrueStageCost(
    run: WorkflowRun,
    stageRun: StageRun,
    stageCwd: string,
  ): Promise<void> {
    const raw = await fs.readFile(path.join(stageCwd, "costs.jsonl"), "utf8").catch(() => "");
    let sum = 0;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const cost = (JSON.parse(line) as { costUsd?: unknown }).costUsd;
        if (typeof cost === "number" && Number.isFinite(cost) && cost > 0) sum += cost;
      } catch {
        this.log.warn("skipping malformed costs.jsonl line", {
          workflowRunId: run.workflowRunId,
          stage: stageRun.dir,
        });
      }
    }
    if (sum > 0) stageRun.externalCostUsd = sum;
  }

  /** P1-03: recompute the run's spend; warn once when it crosses `warnAtPct`. */
  private updateSpend(run: WorkflowRun): void {
    if (!run.budget) return;
    const spent = run.stageRuns.reduce(
      (acc, s) => acc + (s.costUsd ?? 0) + (s.externalCostUsd ?? 0),
      0,
    );
    run.budget.spentUsd = spent;
    if (!run.budget.warned && spent >= (run.budget.maxCostUsd * run.budget.warnAtPct) / 100) {
      run.budget.warned = true;
      this.log.warn("workflow run nearing its spend cap", {
        workflowRunId: run.workflowRunId,
        spentUsd: spent,
        maxCostUsd: run.budget.maxCostUsd,
      });
    }
  }

  /**
   * Resume an `output`-parked run after the operator's decision on its PR gate.
   * Approved → run the gated push and continue any later outputs; rejected → leave the
   * branch work without a PR and continue. Either way the run finishes once the
   * remaining outputs are delivered. Never throws (the approval flow must not crash).
   */
  private async resumeOutput(
    workflowRunId: string,
    decision: "approved" | "rejected",
  ): Promise<void> {
    try {
      const run = this.runs.get(workflowRunId) ?? (await this.readAggregate(workflowRunId));
      if (!run || run.parkedReason !== "output" || !run.pendingOutput) {
        this.log.warn("output resume skipped (run not output-parked)", { workflowRunId, decision });
        return;
      }
      this.runs.set(run.workflowRunId, run);
      const workflow = await this.workflows.get(run.workflowId);
      const phaseIds = workflow.phases.map((p) => p.id);
      const index = run.pendingOutput.index;
      const output = (run.outputsOverride ?? workflow.outputs ?? [])[index];
      run.status = "running";
      delete run.parkedReason;
      delete run.pendingOutput;
      await this.writeAggregate(run);
      if (decision === "approved" && output?.type === "pr") {
        if (!(await this.openPrOutput(run, workflow, output))) {
          await this.failBlockedPr(run, phaseIds);
          return;
        }
      } else {
        this.log.info("PR output declined — branch work left without a PR", { workflowRunId });
      }
      await this.runOutputs(run, workflow, index + 1, phaseIds);
    } catch (error) {
      this.log.error("output resume failed", {
        workflowRunId,
        decision,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** A PR hop blocked by the verify gate fails the run; later outputs are not delivered. */
  private async failBlockedPr(run: WorkflowRun, phaseIds: string[]): Promise<void> {
    run.status = "failed";
    run.currentStage = null;
    await this.writeAggregate(run);
    await this.writeProgress(run, phaseIds);
    this.log.info("workflow run finished", { status: run.status, stages: run.stageRuns.length });
  }

  /**
   * The dev → rel hop: a `dev`-owned run with a worktree opens its PR only on green
   * verify evidence for the exact HEAD being pushed. Returns the block reason, or
   * null when the hop may proceed (fail-closed: an unreadable HEAD blocks).
   */
  private async verifyGateBlock(run: WorkflowRun, workflow: Workflow): Promise<string | null> {
    if (workflow.department !== "dev" || !run.workspace) return null;
    const head = await this.workspace.headSha(run.workspace.path).catch(() => undefined);
    const ev = run.verifyEvidence;
    if (!ev) return "no verify evidence";
    if (ev.exitCode !== 0) return `verify exited ${ev.exitCode}`;
    if (!head) return "HEAD unreadable";
    if (!ev.sha) return "verify evidence has no sha";
    if (ev.sha !== head) return `HEAD ${head} is not the verified ${ev.sha}`;
    return null;
  }

  /**
   * Execute an approved `pr` output: write the PR draft and run the gated push.
   * Returns false when the verify gate blocked the hop (the caller fails the run).
   */
  private async openPrOutput(
    run: WorkflowRun,
    workflow: Workflow,
    output: Extract<WorkflowOutput, { type: "pr" }>,
  ): Promise<boolean> {
    const source = await this.resolveOutputSource(run, workflow, output.from);
    const content = source ? await fs.readFile(source, "utf8").catch(() => "") : "";
    const { title } = this.parsePrMarkdown(content);
    // Keep `pr-draft.md` as the durable run artifact the web detail serves.
    const bodyFile = path.join(run.cwd, "pr-draft.md");
    await fs
      .writeFile(bodyFile, content.trim() ? content : `# ${title || run.workflowId}\n`, "utf8")
      .catch(() => {});
    if (!run.workspace) {
      this.log.warn("PR output approved but run has no worktree; nothing pushed", {
        workflowRunId: run.workflowRunId,
      });
      return true;
    }
    const blocked = await this.verifyGateBlock(run, workflow);
    if (blocked) {
      run.prBlockedReason = blocked;
      this.log.warn("PR output blocked by the verify gate", {
        workflowRunId: run.workflowRunId,
        reason: blocked,
      });
      await this.writeAggregate(run);
      return false;
    }
    // NS2 F0b — per-project draft PR mode; a project-less run (no match on
    // `projectForRun`) stays `"ready"`, same as an absent `prOpenMode`.
    const project = await this.projectForRun(run).catch((): Project | null => null);
    const result = await this.workspace.openPr({
      cwd: run.workspace.path,
      title: title || run.workflowId,
      bodyFile,
      draft: project?.prOpenMode === "draft",
    });
    if (result) {
      const stats = await this.workspace
        .diffStats({ worktreePath: run.workspace.path, baseRef: run.workspace.baseRef })
        .catch(() => ({ additions: 0, deletions: 0 }));
      run.prOutput = {
        url: result.url,
        additions: stats.additions,
        deletions: stats.deletions,
      };
      await this.writeAggregate(run);
      this.log.info("PR output opened", { workflowRunId: run.workflowRunId, url: result.url });
      await this.recordArtifact(run, "pr", output.from, result.url);
    } else {
      this.log.warn("PR output push failed (soft) — branch work is committed and safe", {
        workflowRunId: run.workflowRunId,
      });
    }
    return true;
  }

  /**
   * Phase 9.3 — checkpoint a green phase on the run branch (worktree only). Skips
   * cleanly when there is no worktree or the tree is clean; on success records the sha
   * on `run.checkpoints`. The commit message summary is the first line of the phase's
   * `produces` file when present, else "attempt N". NEVER pushes.
   */
  private async checkpointPhase(
    run: WorkflowRun,
    phase: WorkflowPhase,
    stageCwd: string,
    attempt: number,
  ): Promise<void> {
    if (!run.workspace) return;
    let summary = `attempt ${attempt}`;
    if (phase.produces) {
      const body = await fs.readFile(path.join(stageCwd, phase.produces), "utf8").catch(() => "");
      const firstLine = body
        .split(/\r?\n/)
        .find((l) => l.trim().length > 0)
        ?.trim();
      if (firstLine) summary = firstLine.slice(0, 100);
    }
    const result = await this.workspace
      .checkpoint({ worktreePath: run.workspace.path, phaseId: phase.id, summary })
      .catch(() => null);
    if (!result) return;
    run.checkpoints = [
      ...(run.checkpoints ?? []),
      { phaseId: phase.id, sha: result.sha, at: new Date().toISOString() },
    ];
    await this.writeAggregate(run);
  }

  /**
   * Grant-ordering progress (decision 5): the furthest phase this run ever reached,
   * over the phase count — a loop-back (review → koder) keeps its reached progress.
   */
  private progressOf(run: WorkflowRun, phaseIds: readonly string[], phaseId: string): number {
    const reached = Math.max(
      phaseIds.indexOf(phaseId),
      ...run.stageRuns.map((s) => phaseIds.indexOf(s.phaseId)),
    );
    return (reached + 1) / phaseIds.length;
  }

  /** Rewrite `<run cwd>/PROGRESS.md` from the aggregate (pure {@link renderProgress}). */
  private async writeProgress(run: WorkflowRun, phaseIds: readonly string[]): Promise<void> {
    await fs
      .writeFile(path.join(run.cwd, "PROGRESS.md"), renderProgress(run, phaseIds), "utf8")
      .catch(() => {
        // Best-effort: a failed PROGRESS write degrades the surface, not the run.
      });
  }

  /** The tail of a stage's log (the failure context the resume-context summarizes). */
  private async tailLog(stageRunId: string, maxChars = 2000): Promise<string> {
    const log = await this.core.readLog(stageRunId, 0).catch(() => null);
    const content = log?.content ?? "";
    return content.length > maxChars ? content.slice(content.length - maxChars) : content;
  }

  /**
   * Phase 9.3 — assemble the resume-context block for a continuation phase from the
   * current `PROGRESS.md`, the branch's checkpoint log, and an optional note / failure
   * tail. Pure-input gathering around the pure {@link buildResumeContext} builder.
   */
  private async composeResumeContext(
    run: WorkflowRun,
    phaseIds: readonly string[],
    extra: { note?: string; failureTail?: string },
  ): Promise<string> {
    const progressMd =
      (await fs.readFile(path.join(run.cwd, "PROGRESS.md"), "utf8").catch(() => "")) ||
      renderProgress(run, phaseIds);
    const checkpointLog = run.workspace
      ? await this.workspace.commitLog({
          worktreePath: run.workspace.path,
          baseRef: run.workspace.baseRef,
        })
      : "";
    return buildResumeContext({
      progressMd,
      checkpointLog,
      note: extra.note,
      failureTail: extra.failureTail,
    });
  }

  /**
   * The escalation rung for `attempt` (1 = the original run, no override; retry
   * n applies rung n, later retries clamp to the last rung).
   */
  private escalationFor(phase: WorkflowPhase, attempt: number): PhaseEscalation | null {
    const ladder = phase.loop?.escalation;
    if (!ladder || ladder.length === 0 || attempt <= 1) return null;
    return ladder[Math.min(attempt - 2, ladder.length - 1)] ?? null;
  }

  /**
   * Phase D: the env vars to inject into a stage — the project's non-secret `env`
   * overlaid with its write-only secrets (secrets win on a key clash). Returns
   * undefined when the project is unresolved or carries neither. Secrets are read
   * here and never logged; the core applies the ZIBBY-owned intent-dir pin after.
   */
  private async resolveProjectEnv(
    project: Project | null,
  ): Promise<Record<string, string> | undefined> {
    if (!project) return undefined;
    const secrets = await this.projectSecrets.read(project.id).catch(() => null);
    const merged = { ...(project.env ?? {}), ...(secrets ?? {}) };
    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  /** Spawn one stage child and wait for it to finish; return its StageRun. */
  private async runStage(
    run: WorkflowRun,
    phase: WorkflowPhase,
    stageCwd: string,
    attempt: number,
    project: Project | null,
    resumeContext?: string,
    delegates?: readonly string[],
    lease?: EmployeeLease,
  ): Promise<StageRun> {
    const escalation = this.escalationFor(phase, attempt);
    if (escalation) {
      this.log.info("applying escalation rung", { phase: phase.id, attempt, ...escalation });
    }
    // F4a: resolve the workflow's owning department once per stage so grounding
    // can attach its knowledge shelf. Fail-open — a missing/renamed workflow
    // must never block the stage.
    const department = (await this.workflows.get(run.workflowId).catch(() => null))?.department;
    // Materialize enabled custom commands as a ZIBBY-owned plugin in the stage's
    // sandbox (never the client worktree), loaded via `--plugin-dir`; best-effort
    // (a falsy result → no plugin). Only claude agent stages load it — verify/tool
    // phases never spawn claude, and a tool's artifacts must not sweep it up.
    const commandsPlugin =
      phase.type !== "verify" && phase.type !== "tool" && process.env.AGENT_RUNNER_MODE === "claude"
        ? await this.commandMaterializer.materialize(stageCwd)
        : null;
    const { command, args, spawnCwd } = await this.buildStageCommand(
      phase,
      stageCwd,
      project,
      escalation,
      run.workspace?.path,
      run.matchedTerms,
      resumeContext,
      delegates,
      department,
      run.workflowRunId,
      commandsPlugin,
    );
    // Per-project env + secrets injected into this stage's process (Phase D), plus
    // the run/stage folders (P1-01) so a tool can write run-wide artifacts (e.g. the
    // `book/` folder) and any stage can find them after a loop re-dispatch. A tool
    // phase also gets the repo's `node_modules/.bin` first on PATH, so workspace
    // CLIs (`product-factory`) resolve however the API was started.
    const env = {
      ...(await this.resolveProjectEnv(project)),
      ZIBBY_RUN_DIR: run.cwd,
      ZIBBY_STAGE_DIR: stageCwd,
      // Repo bins (e.g. `product-factory`): first for a tool phase; LAST for an agent
      // stage, so a project checkout's own toolchain is never shadowed.
      PATH: (phase.type === "tool"
        ? [REPO_BIN_DIR, process.env.PATH]
        : [process.env.PATH, REPO_BIN_DIR]
      )
        .filter(Boolean)
        .join(path.delimiter),
    };
    const rec = await this.core.start({
      kind: "workflow-stage",
      ownerId: `${run.workflowRunId}.${phase.id}`,
      command,
      args,
      cwd: stageCwd,
      ...(spawnCwd ? { spawnCwd } : {}),
      env,
      extra: { workflowRunId: run.workflowRunId, phaseId: phase.id, attempt },
    });
    // Expose the in-flight child so the detail timeline can tail its log live,
    // before this attempt lands in `stageRuns` (terminal-only). In-memory mutation
    // is enough for the live UI (it polls the aggregate); the driver clears it once
    // the stage goes terminal.
    run.currentStageRunId = rec.runId;
    const status = await this.waitForStage(rec.runId);
    // Cena té fáze se čte z dokončeného stage recordu (naakumulovaná přes
    // případné limit-pause respawny) a promítá se na vrácený StageRun.
    const finishedRec = this.core.get(rec.runId);
    // `dir` records the numbered sandbox folder this dispatch ran in (the basename
    // of the cwd drive() computed), so later lookups find THIS run's folder even
    // after a loop re-runs the same phase into a new one.
    return {
      phaseId: phase.id,
      runId: rec.runId,
      attempt,
      status,
      dir: path.basename(stageCwd),
      ...(finishedRec?.costUsd != null ? { costUsd: finishedRec.costUsd } : {}),
      ...(lease ? { employeeId: lease.employeeId, employeeName: lease.employeeName } : {}),
    };
  }

  /**
   * Poll the core until the stage's child reaches a TERMINAL state. A stage held
   * at `awaiting-approval` (a gated mid-run intent) still has its live child
   * blocking on the decision file — returning there would misread the pause as
   * stage completion, so the wait rides through it and the same phase continues
   * after the approval releases the child.
   */
  private async waitForStage(
    runId: string,
  ): Promise<"done" | "error" | "interrupted" | "paused-limit"> {
    for (;;) {
      const status = this.core.get(runId).status;
      // `awaiting-approval` rides through (the live child still blocks on its
      // decision); every other non-running state is terminal for this wait —
      // `paused-limit` (Phase 9) included, so the driver can pause the aggregate.
      if (status !== "running" && status !== "awaiting-approval") return status;
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  /**
   * Variant B gate for workflow stages. A live stage announced an external-effect
   * action and is blocking on its decision file: evaluate it against the phase
   * agent's rules (plus the locked floor) and steer the child. `ask` parks the
   * whole workflow run (the driver's await rides through the pause) and raises a
   * `workflow-stage` approval keyed by the STAGE run id. Failures fail safe to deny.
   */
  private onStageIntent(stageRunId: string, action: IntendedAction): Promise<void> {
    const traceId = this.trace.getTraceId() ?? randomUUID();
    return this.trace.run({ traceId, runId: stageRunId }, () =>
      this.evaluateStageIntent(stageRunId, action),
    );
  }

  private async evaluateStageIntent(stageRunId: string, action: IntendedAction): Promise<void> {
    try {
      const rec = this.core.get(stageRunId);
      const run = this.runs.get(rec.workflowRunId);
      if (!run) throw new WorkflowRunNotFoundError(rec.workflowRunId);
      const workflow = await this.workflows.get(run.workflowId);
      const phase = workflow.phases.find((p) => p.id === rec.phaseId);
      if (!phase) throw new Error(`Phase "${rec.phaseId}" not found in "${run.workflowId}"`);
      // Verify phases never spawn claude, so they can't raise intents — an
      // agent-less phase here is a malformed signal; the catch denies it.
      if (!phase.agent) throw new Error(`Phase "${rec.phaseId}" carries no agent`);
      const agent = await this.agents.get(phase.agent);
      // NS2 F3a — a workflow stage evaluates with the WORKFLOW's owning
      // department's catalog-rule bucket (the executing unit is the authoritative
      // actor; the phase agent may be shared across departments).
      const rules = await this.gates.rulesForAgentInDepartment(
        {
          gates: agent.gates,
          requires_approval: agent.requires_approval,
        },
        workflow.department,
      );
      const evaluation = this.gates.evaluate(rules, action);
      this.log.info("evaluating mid-run stage intent", {
        workflowRunId: run.workflowRunId,
        phaseId: rec.phaseId,
        action: action.action,
        decision: evaluation.decision,
        ruleId: evaluation.ruleId,
      });

      if (evaluation.decision === "deny") {
        await this.core.denyIntent(stageRunId);
        return;
      }
      if (evaluation.decision === "ask") {
        // Hold the stage (its child keeps blocking) and park the aggregate — the
        // web maps parked+approval → awaiting-approval and refetches approvals.
        await this.core.holdForApproval(stageRunId);
        run.status = "parked";
        run.parkedReason = "approval";
        // Phase 3.3: the PR gate's Tier-3 decision surface is assembled HERE, at
        // park time (not on demand) — for a push/PR gate on a worktree run, write
        // the branch-vs-base diffstat next to the run so the card can show it.
        if ((action.action === "pr.open" || action.action === "git.push") && run.workspace) {
          const diff = await this.workspace
            .diffstat({ worktreePath: run.workspace.path, baseRef: run.workspace.baseRef })
            .catch(() => "");
          if (diff) {
            await fs.writeFile(path.join(run.cwd, "diffstat.txt"), diff, "utf8").catch(() => {});
          }
        }
        await this.writeAggregate(run);
        await this.approvals.requestApproval({
          runId: stageRunId,
          kind: "workflow-stage",
          skill: agent.name ?? agent.id,
          action: action.action,
          detail: action.context ?? `Workflow "${run.workflowId}", fáze "${rec.phaseId}"`,
          risk: agent.risk ?? "medium",
          // NS2 F3c — attribute the approval to the EXECUTING unit's owner (the
          // workflow, not the phase agent, which may be shared across departments).
          ...(workflow.department ? { department: workflow.department } : {}),
        });
        return;
      }
      // allow / notify: let the action proceed immediately.
      await this.core.allowIntent(stageRunId);
    } catch (error) {
      // Unknown phase/agent or evaluation failure → fail safe: refuse the action.
      this.log.error("stage intent evaluation failed; failing safe to deny", {
        stageRunId,
        err: error instanceof Error ? error.message : String(error),
      });
      await this.core.denyIntent(stageRunId).catch(() => {});
    }
  }

  /** Flip the aggregate that owns `stageRunId` to `status` and persist it. */
  private async setAggregateStatus(
    stageRunId: string,
    status: WorkflowRun["status"],
  ): Promise<void> {
    const rec = this.core.get(stageRunId);
    const run = this.runs.get(rec.workflowRunId);
    if (!run) return;
    run.status = status;
    if (status !== "parked") delete run.parkedReason;
    await this.writeAggregate(run);
  }

  /**
   * Link the handoff source (if any) into this stage's `consumes` path — a RELATIVE
   * symlink (not a copy), so the agent reads the previous phase's actual artifact
   * instead of an independent byte-for-byte duplicate it (or a careless rewrite) can
   * silently drift from. Relative so the link survives moving the whole run folder
   * (`path.relative` is computed from the link's own directory, per POSIX symlink
   * resolution — not from the process cwd).
   */
  private async placeHandoff(
    source: string | null,
    stageCwd: string,
    phase: WorkflowPhase,
  ): Promise<void> {
    // A verify phase declares no `consumes` — it checks the project, not a file.
    if (!source || !phase.consumes) return;
    const dest = this.resolveInside(stageCwd, phase.consumes);
    if (!dest) return;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const relativeTarget = path.relative(path.dirname(dest), source);
    await fs.symlink(relativeTarget, dest).catch(() => {
      // A missing source (or a stale link already at `dest`) is not fatal — the
      // stage simply starts without input.
    });
  }

  /**
   * Build a fresh stage sandbox: the folder, the run's shared `context/` linked in
   * (P1-T3, relative like the handoff symlink) and the phase's `consumes` handoff.
   */
  private async prepareStageDir(
    run: WorkflowRun,
    stageCwd: string,
    handoffSource: string | null,
    phase: WorkflowPhase,
  ): Promise<void> {
    await fs.mkdir(stageCwd, { recursive: true });
    await fs
      .symlink(
        path.relative(stageCwd, path.join(run.cwd, "context")),
        path.join(stageCwd, "context"),
      )
      .catch(() => {});
    await this.placeHandoff(handoffSource, stageCwd, phase);
  }

  /**
   * Start a `workflow` phase's sub-run. The child gets the handoff file's content as
   * its input, the parent's workspace and the parent's remaining spend as its cap.
   * Returns null once the child is running (the parent now waits on `pendingChild`),
   * or an `error` stage when the child cannot start (unknown workflow, cycle, depth).
   */
  private async startChild(
    run: WorkflowRun,
    phase: WorkflowPhase,
    stageDir: string,
    attempt: number,
    handoffSource: string | null,
    retries: Map<string, number>,
    phaseIds: readonly string[],
    project: Project | null,
  ): Promise<StageRun | null> {
    const fail = async (reason: string): Promise<StageRun> => {
      this.log.warn("sub-run refused", { phase: phase.id, child: phase.workflow, reason });
      await fs
        .writeFile(path.join(run.cwd, stageDir, "sub-run.error.txt"), reason, "utf8")
        .catch(() => {});
      return {
        phaseId: phase.id,
        runId: `${run.workflowRunId}.${phase.id}.sub-run`,
        attempt,
        status: "error",
        dir: stageDir,
      };
    };
    const childId = phase.workflow;
    if (!childId) return fail("no child workflow named");
    const ancestry = await this.ancestry(run);
    if (ancestry.includes(childId)) return fail(`cycle: ${[...ancestry, childId].join(" → ")}`);
    if (ancestry.length > MAX_SUB_RUN_DEPTH)
      return fail(`sub-runs nest at most ${MAX_SUB_RUN_DEPTH} deep`);
    const input = handoffSource ? await fs.readFile(handoffSource, "utf8").catch(() => "") : "";
    let child: WorkflowRun;
    try {
      child = await this.start(
        childId,
        undefined,
        project?.id,
        run.matchedTerms,
        run.workspace,
        undefined,
        input,
        {
          parentRunId: run.workflowRunId,
          ...(run.budget
            ? { maxCostUsd: Math.max(0, run.budget.maxCostUsd - run.budget.spentUsd) }
            : {}),
        },
      );
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    run.pendingChild = {
      phaseId: phase.id,
      childRunId: child.workflowRunId,
      attempt,
      stageDir,
      handoffSource,
    };
    run.retries = Object.fromEntries(retries);
    await this.writeAggregate(run);
    await this.writeProgress(run, phaseIds);
    this.log.info("sub-run started", { phase: phase.id, child: child.workflowRunId });
    // A child born terminal (e.g. its worktree setup failed) emitted before we waited.
    if (child.status !== "running") void this.onChildStatus(child);
    return null;
  }

  /** Workflow ids from this run up through its parents (this run first). */
  private async ancestry(run: WorkflowRun): Promise<string[]> {
    const ids = [run.workflowId];
    let parentId = run.parentRunId;
    while (parentId && ids.length <= MAX_SUB_RUN_DEPTH + 1) {
      const parent = this.runs.get(parentId) ?? (await this.readAggregate(parentId));
      if (!parent) break;
      ids.push(parent.workflowId);
      parentId = parent.parentRunId;
    }
    return ids;
  }

  /**
   * Mirror a sub-run's state onto the parent waiting on it: parked/paused → the parent
   * parks (`child`), running → it runs again, terminal → the parent's `workflow` stage
   * settles (the child's latest artifact becomes its `produces`, the child's spend its
   * cost) and the driver re-enters that phase.
   */
  private async onChildStatus(child: WorkflowRun): Promise<void> {
    if (!child.parentRunId) return;
    try {
      const parent =
        this.runs.get(child.parentRunId) ?? (await this.readAggregate(child.parentRunId));
      const pending = parent?.pendingChild;
      if (!parent || !pending || pending.childRunId !== child.workflowRunId) return;
      this.runs.set(parent.workflowRunId, parent);
      if (child.status === "running") {
        if (parent.status === "parked" && parent.parkedReason === "child") {
          parent.status = "running";
          delete parent.parkedReason;
          await this.writeAggregate(parent);
        }
        return;
      }
      if (child.status === "parked" || child.status === "paused-limit") {
        if (parent.status !== "parked") {
          parent.status = "parked";
          parent.parkedReason = "child";
          await this.writeAggregate(parent);
        }
        return;
      }
      delete parent.pendingChild; // settle exactly once
      const workflow = await this.workflows.get(parent.workflowId);
      const phase = workflow.phases.find((p) => p.id === pending.phaseId);
      let status: StageRun["status"] =
        child.status === "done" ? "done" : child.status === "interrupted" ? "interrupted" : "error";
      if (status === "done" && phase?.produces) {
        const artifact = await this.readLatestArtifact(child.workflowRunId);
        const dest = this.resolveInside(path.join(parent.cwd, pending.stageDir), phase.produces);
        if (artifact && dest) await fs.writeFile(dest, artifact.content, "utf8");
        else status = "error";
      }
      const stageRun: StageRun = {
        phaseId: pending.phaseId,
        runId: child.workflowRunId,
        childRunId: child.workflowRunId,
        attempt: pending.attempt,
        status,
        dir: pending.stageDir,
        costUsd: runSpend(child),
      };
      parent.status = "running";
      delete parent.parkedReason;
      await this.writeAggregate(parent);
      const project = await this.projectForRun(parent);
      const traceId = this.trace.getTraceId() ?? randomUUID();
      void this.trace.run({ traceId, runId: parent.workflowRunId }, () =>
        this.drive(parent, workflow, project, {
          cursor: pending.phaseId,
          handoffSource: pending.handoffSource,
          retries: new Map(Object.entries(parent.retries ?? {})),
          child: stageRun,
        }),
      );
    } catch (error) {
      this.log.error("sub-run settle failed", {
        child: child.workflowRunId,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Write the failed stage's log tail as the handoff context for the retry. */
  private async writeFailureContext(
    run: WorkflowRun,
    phase: WorkflowPhase,
    stageRun: StageRun,
  ): Promise<string> {
    const file = path.join(run.cwd, `${phase.id}.failure.txt`);
    const log = await this.core.readLog(stageRun.runId, 0).catch(() => null);
    const body = `Phase "${phase.id}" failed (attempt ${stageRun.attempt}).\n\n${log?.content ?? ""}`;
    await fs.writeFile(file, body, "utf8").catch(() => {});
    return file;
  }

  /** Resolve a relative path strictly inside `base`, rejecting `..` escapes. */
  private resolveInside(base: string, rel: string): string | null {
    const resolved = path.resolve(base, rel);
    const baseResolved = path.resolve(base);
    if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
      return null;
    }
    return resolved;
  }

  private async buildStageCommand(
    phase: WorkflowPhase,
    cwd: string,
    project: Project | null,
    escalation: PhaseEscalation | null = null,
    /**
     * The run's worktree path (Phase 3.1) when the git project got one — every
     * stage spawns there so verify checks koder's *committed* changes and review
     * sees them. Falls back to the project checkout (non-git / projectless: Phase 2).
     */
    worktreePath?: string,
    /** Persisted classifier terms (Phase 4) — drive memory-grounding MOC selection. */
    matchedTerms?: string[],
    /** Phase 9.3: resume-context prefix for a continuation phase (limit/parked/loop). */
    resumeContext?: string,
    /** Curated `--agents` delegation roster (this workflow's stage agents) — keeps the
     *  whole agent library off argv (spawn E2BIG). */
    delegates?: readonly string[],
    /** F4a: the workflow's owning department — forwarded into grounding so the
     *  stage sees the owner's knowledge shelf. */
    department?: DepartmentId,
    /**
     * Task 5: the workflow run's own stable identity (`WorkflowRun.workflowRunId`,
     * known up-front — unlike the stage's own core-internal run id, which isn't
     * assigned until spawn). Threaded to
     * {@link ClaudeRunCommandService.buildClaudeCommand} as `runId` so it can ride
     * the `X-Zibby-Run-Id` header to ZIBBY's own in-process MCP servers.
     */
    workflowRunId?: string,
    /** ZIBBY's per-run commands plugin dir (from the materializer), if any. */
    commandsPluginDir?: string | null,
  ): Promise<{ command: string; args: string[]; spawnCwd?: string }> {
    const spawnCwd = worktreePath ?? project?.path;
    // Verify phases are deterministic shell checks — identical in demo and
    // claude mode (no model, no tokens, no intents, no preflight). They run in
    // the run's worktree (or project checkout) when one was resolved, else the sandbox.
    if (phase.type === "verify") {
      // Phase 10.2: the verify-command assembly is lifted into a shared helper so the
      // workflow verify stage and the goal `checks` verifier resolve checks identically.
      return buildVerifyCommand({
        commands: phase.commands,
        projectChecks: project?.checks,
        spawnCwd,
        // A clean checkout needs a run branch to check out — only with a worktree.
        cleanCheckout: phase.checkout === "clean" && worktreePath !== undefined,
      });
    }
    // P1-01: a tool phase is a deterministic transform of the handoff — it runs IN
    // THE STAGE SANDBOX (its `consumes` symlink and `produces` file live there), never
    // in the project checkout, and never falls back to project/default checks.
    if (phase.type === "tool") {
      return buildVerifyCommand({
        commands: phase.commands,
        projectChecks: undefined,
        spawnCwd: cwd,
      });
    }
    if (process.env.AGENT_RUNNER_MODE === "claude") {
      // The phase's agent drives the stage: its instructions become the session
      // system prompt; the task tells it to consume the handoff and produce the
      // next one. The demo path covers the workflow machinery without tokens.
      if (!phase.agent) throw new Error(`Agent phase "${phase.id}" carries no agent`);
      const agent = await this.agents.get(phase.agent);
      // Handoff paths are passed ABSOLUTE: with a project resolved the session
      // spawns inside the checkout (only its CLAUDE.md loads, via `contextDir`),
      // so anything sandbox-relative would silently resolve against the repo.
      const consumesAbs = phase.consumes ? path.join(cwd, phase.consumes) : null;
      const producesAbs = phase.produces ? path.join(cwd, phase.produces) : null;
      const task = buildStageTask({
        phaseId: phase.id,
        consumesAbs,
        producesAbs,
        qualify: phase.qualify,
        runDirAbs: path.dirname(cwd),
        ...(project?.web ? { webUrl: project.web.url } : {}),
      });
      // Memory grounding (Phase 4): per-stage so each phase's agent gets the North
      // Star + relevant MOCs + the project note. Fail-open ("" on any error).
      const grounding = await this.grounding.compose({
        task,
        projectId: project?.id,
        matchedTerms,
        department,
      });
      // P1-T2: `cwd` is THIS stage's own sandbox folder, a subdirectory of the run
      // root (`path.dirname(cwd)`). The handoff into `consumes` is now a relative
      // SYMLINK whose target can live in a PREVIOUS phase's sibling sandbox — reading
      // through it needs the whole run root granted, not just this stage's own
      // folder. With no `consumes` there's nothing cross-folder to read; the
      // narrower existing grant (just this stage's own sandbox, so the session can
      // still write `produces` back into it) applies when the session spawns
      // elsewhere (worktree/project).
      const grantDirs = phase.consumes ? [path.dirname(cwd)] : spawnCwd ? [cwd] : undefined;
      const built = await this.claude.buildClaudeCommand({
        instructions: agent.instructions,
        task,
        tools: agent.tools,
        // Escalation rung (a retry's harder model/thinking) > phase > agent.
        model: escalation?.model ?? phase.model ?? agent.model,
        thinking: escalation?.thinking ?? phase.thinking ?? agent.thinking,
        grounding,
        // Phase 9.3: a continuation phase gets the resume-context in its system prompt.
        ...(resumeContext ? { resumeContext } : {}),
        // The sandbox holds the handoff files; with cwd in the worktree/project the
        // session still needs access to it (reverse grant) — widened to the run root
        // when a symlinked `consumes` may point at a sibling stage folder.
        ...(grantDirs ? { grantDirs } : {}),
        // Curated delegation roster + system prompt spilled to the sandbox: both keep
        // the run's argv under the OS limit (spawn E2BIG) as the agent library grows.
        ...(delegates ? { delegates } : {}),
        ...(workflowRunId ? { runId: workflowRunId } : {}),
        systemPromptDir: cwd,
        pluginDirs: [
          ...(agent.plugins ?? []),
          ...(project?.plugins ?? []),
          ...(commandsPluginDir ? [commandsPluginDir] : []),
        ],
        ...(spawnCwd ? { contextDir: spawnCwd } : {}),
        // Spawn in stream-json mode so the stage log captures the agent's whole
        // run (thinking + tool calls), flattened by the core's formatLine — not
        // just claude's final message. Mirrors the agent runner.
        streamTranscript: true,
      });
      return spawnCwd ? { ...built, spawnCwd } : built;
    }
    const script =
      process.env.WORKFLOW_DEMO_STAGE_SCRIPT ??
      process.env.PIPELINE_DEMO_STAGE_SCRIPT ??
      path.resolve(__dirname, "demo-stage.mjs");
    return {
      command: process.execPath,
      args: [script, cwd, phase.id, phase.produces ?? "", phase.consumes ?? ""],
    };
  }

  /** The run's folder inside the runs dir, or null if the id would escape it. */
  private resolveRunDir(workflowRunId: string): string | null {
    const dir = path.resolve(this.dir, workflowRunId);
    if (path.dirname(dir) !== this.dir) return null;
    return dir;
  }

  /** Read a run's aggregate `run.json` from disk (for a run dropped from memory). */
  private async readAggregate(workflowRunId: string): Promise<WorkflowRun | null> {
    const root = this.resolveRunDir(workflowRunId);
    if (!root) return null;
    const raw = await fs.readFile(path.join(root, AGGREGATE_FILE), "utf8").catch(() => null);
    if (raw === null) return null;
    try {
      const parsed = WorkflowRunSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Subscribe to aggregate transitions of every workflow run. Backs the unified
   * `/api/events` SSE channel; returns an unsubscribe for the controller to call
   * when the stream closes.
   */
  onRunStatus(listener: (run: WorkflowRun) => void): () => void {
    this.events.on("status", listener);
    return () => this.events.off("status", listener);
  }

  private async writeAggregate(run: WorkflowRun): Promise<void> {
    await writeFileAtomic(path.join(run.cwd, AGGREGATE_FILE), JSON.stringify(run)).catch(() => {
      // Best-effort: a failed write degrades restart fidelity, not the run.
    });
    // Persisting is the transition point — notify the status channel after it so a
    // subscriber that refetches sees the same state we just wrote to disk.
    this.events.emit("status", run);
  }

  /**
   * True when `stageRunId`'s stage record survived {@link RunnerCore.init} as a
   * LIVE orphan (Phase 6: a detached child that outlived a hard crash — its pgid
   * is still alive, so `init()` reattaches an exit monitor instead of reconciling
   * it to `interrupted`). `core.get` throws `RunNotFoundError` for anything not in
   * the rebuilt registry (dead orphan, no stage record at all), which reads here
   * as "not surviving".
   */
  private stageStillRunning(stageRunId: string): boolean {
    try {
      return this.core.get(stageRunId).status === "running";
    } catch {
      return false;
    }
  }

  /**
   * Rebuild aggregates from `<runRoot>/run.json` sidecars. A mid-flight run
   * normally fails (its child died with the previous backend) — UNLESS its
   * current stage survived as a live orphan (see {@link stageStillRunning}), in
   * which case the aggregate is left `running` and the reattached exit monitor
   * drives it to its normal terminal transition.
   */
  private async reconstruct(): Promise<void> {
    const entries = await fs.readdir(this.dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const file = path.join(this.dir, entry.name, AGGREGATE_FILE);
      const raw = await fs.readFile(file, "utf8").catch(() => null);
      if (raw === null) continue;
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      const parsed = WorkflowRunSchema.safeParse(data);
      if (!parsed.success) continue;
      let run = parsed.data;
      // A run left "running" lost its mid-flight child with the previous backend —
      // UNLESS that child survived as a live orphan (Phase 6): its stage record is
      // still `running` after `core.init()` reattached a pgid monitor, so honor
      // that instead of failing a run that is actually still executing.
      const survivingOrphan =
        run.status === "running" &&
        run.currentStageRunId !== undefined &&
        this.stageStillRunning(run.currentStageRunId);
      // An APPROVAL-parked run is the same situation (its blocking child died
      // with the API) → honest reconciliation is `failed`. A RETRIES-parked run
      // has no child at all — it is durable and stays parked, resumable. A
      // `paused-limit` aggregate (Phase 9) is likewise durable: a mid-stage pause's
      // stage record (with its stashed spec) is rebuilt by core.init above, and a
      // boundary pause has no child at all — both survive by status alone, so they
      // fall through and stay resumable by the auto-resume tick.
      // `output` parking (a PR-gate wait after the chain already finished) has no live
      // child either — it is durable like `retries` and survives the restart parked.
      // `gate`/`budget` (P1-02/03) park at a phase boundary with no child — durable too.
      const durableParks: (string | undefined)[] = ["retries", "output", "gate", "budget", "child"];
      const approvalParked = run.status === "parked" && !durableParks.includes(run.parkedReason);
      // A parent waiting on a sub-run has no child process of its own — it is settled
      // from the child's state right after this sweep.
      const waitsOnChild = run.pendingChild !== undefined;
      if ((run.status === "running" && !survivingOrphan && !waitsOnChild) || approvalParked) {
        run = {
          ...run,
          status: "failed",
          currentStage: null,
          parkedReason: undefined,
          parked: undefined,
          waitingForStaff: undefined,
        };
        await this.writeAggregate(run);
      }
      this.runs.set(run.workflowRunId, run);
    }
    // Second pass, once every aggregate is loaded: re-sync each waiting parent with
    // its sub-run (which the sweep above may just have failed). A vanished child
    // fails the parent's stage like a failed one.
    for (const run of [...this.runs.values()]) {
      const pending = run.pendingChild;
      if (!pending) continue;
      const child = this.runs.get(pending.childRunId);
      await this.onChildStatus(
        child ?? {
          ...run,
          workflowRunId: pending.childRunId,
          parentRunId: run.workflowRunId,
          status: "failed",
          stageRuns: [],
        },
      );
    }
  }
}
