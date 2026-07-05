import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  type ArtifactKind,
  DEFAULT_VERIFY_CHECKS,
  type IntendedAction,
  PIPELINE_RUN_ARTIFACTS,
  type PhaseEscalation,
  type Pipeline,
  type PipelineOutput,
  type PipelinePhase,
  type PipelineRun,
  type PipelineRunArtifact,
  PipelineRunSchema,
  type Project,
  type RunLogChunk,
  type StageRun,
  type StageVerdict,
  type TaskOutput,
  type Workspace,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { ArtifactsStorageService, artifactRecordId } from "../artifacts/artifacts.storage.service";
import { GateEvaluatorService } from "../gates/gate-evaluator.service";
import { GroundingService } from "../memory/grounding.service";
import { DuplicateNoteError, VaultService } from "../memory/vault.service";
import { ClaudePreflightService } from "../runner/claude-preflight.service";
import { ClaudeRunCommandService } from "../runner/claude-run-command.service";
import { formatClaudeStreamLine } from "../runner/claude-stream-format";
import { CommandMaterializerService } from "../runner/command-materializer.service";
import { RunnerCore } from "../runner/runner-core";
import { LimitsService } from "../limits/limits.service";
import { ProjectSecretsStore } from "../projects/project-secrets.store";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { prepareWorktreeDir } from "../shared/worktree-root";
import { WorkspaceService, WorkspaceSetupError } from "../workspace/workspace.service";
import { buildStageTask } from "./build-stage-task";
import { PipelinesStorageService } from "./pipelines.storage.service";
import { type PipelineStageRecord, pipelineStageStrategy } from "./pipeline-stage.record";
import { renderProgress } from "./progress";
import { buildResumeContext } from "./resume-context";
import { parseStageVerdict } from "./stage-verdict";
import { buildVerifyCommand } from "./verify-command";

/** DI token carrying the absolute path of the directory that holds pipeline run artifacts. */
export const PIPELINE_RUNS_DIR = "PIPELINE_RUNS_DIR";

const RETENTION_MS = 30 * 60 * 1000;
const MAX_LISTED = 50;
const AGGREGATE_FILE = "run.json";

// Re-exported so the controller can map it to a 404 without importing the core.
export { RunNotFoundError } from "../runner/runner-core";

/** Raised when a pipeline run id is unknown — controllers map it to a 404. */
export class PipelineRunNotFoundError extends Error {
  constructor(id: string) {
    super(`Pipeline run "${id}" not found`);
    this.name = "PipelineRunNotFoundError";
  }
}

/**
 * Raised when resume-with-note targets a run that is not retries-parked —
 * controllers map it to a 409. Approval-parked runs resume only through the
 * approvals path, so there is exactly one gate per parking machine.
 */
export class RunNotRetriesParkedError extends Error {
  constructor(id: string) {
    super(`Pipeline run "${id}" is not retries-parked`);
    this.name = "RunNotRetriesParkedError";
  }
}

/**
 * Runs a pipeline by chaining its phases through the shared {@link RunnerCore}: one
 * child process per phase (so each stage's log polls independently), handoff over
 * disk (phase N's `produces` is copied into phase N+1's `consumes`), and the
 * tester loop / back-edge with `maxRetries` as a hard fuse against an infinite
 * loop.
 *
 * The aggregate {@link PipelineRun} is held in memory and mirrored to a
 * `<runRoot>/run.json` sidecar after every transition, so a restart can report an
 * accurate `currentStage`. A pipeline can't auto-resume a mid-flight child, so a
 * run left `running` at restart is reconciled to `failed` (same honesty as agent
 * runs being relabelled `interrupted`).
 */
@Injectable()
export class PipelineRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly dir: string;
  private readonly core: RunnerCore<PipelineStageRecord>;
  private readonly runs = new Map<string, PipelineRun>();
  private readonly log: ScopedLogger;
  /**
   * Push channel for aggregate transitions. Unlike agent runs (whose lifecycle the
   * core owns), the pipeline aggregate lives here, so the event fires from
   * {@link writeAggregate} — every persisted transition (stage advance, finish)
   * notifies the `/api/events` SSE channel, replacing the FE's 1s aggregate poll.
   */
  private readonly events = new EventEmitter();

  constructor(
    @Inject(PIPELINE_RUNS_DIR) dir: string,
    private readonly pipelines: PipelinesStorageService,
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
  ) {
    this.dir = path.resolve(dir);
    this.log = logger.child(PipelineRunnerService.name);
    // One listener per open SSE connection; lift the default cap of 10.
    this.events.setMaxListeners(0);
    // Variant B for stages: a live claude stage announcing a destructive action
    // (via the hook's intent-request.json) routes through the gate evaluator.
    this.core = new RunnerCore(
      this.dir,
      pipelineStageStrategy,
      // Phase 9: a stage's usage-limit line busts the limits cache (previously the
      // pipeline runner dropped the signal entirely — undefined here).
      () => this.limits.noteLimitHit(),
      (stageRunId, action) => this.onStageIntent(stageRunId, action),
      logger.child("RunnerCore:pipeline"),
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
    this.approvals.register("pipeline-stage", {
      resume: async (stageRunId) => {
        try {
          await this.core.resume(stageRunId);
          await this.setAggregateStatus(stageRunId, "running");
        } catch (error) {
          // The run may have been deleted while its approval sat in the queue.
          this.log.warn("pipeline-stage resume skipped (run not found)", {
            stageRunId,
            err: error instanceof Error ? error.message : String(error),
          });
        }
      },
      cancel: (stageRunId) => {
        try {
          this.core.cancel(stageRunId);
        } catch (error) {
          this.log.warn("pipeline-stage cancel skipped (run not found)", {
            stageRunId,
            err: error instanceof Error ? error.message : String(error),
          });
        }
      },
    });
    // A pipeline-level `pr` output sink parks the whole aggregate (no live child).
    // The approval's runId IS the pipelineRunId: approve → run the gated push and
    // finish the run; reject → leave the branch work without a PR (still `done`).
    this.approvals.register("pipeline-output", {
      resume: (pipelineRunId) => this.resumeOutput(pipelineRunId, "approved"),
      cancel: (pipelineRunId) => void this.resumeOutput(pipelineRunId, "rejected"),
    });
    await this.core.init();
    await this.reconstruct();
  }

  async onModuleDestroy(): Promise<void> {
    await this.core.shutdown();
  }

  /**
   * Start a run of `pipelineId`. Returns immediately; phases run in the background.
   * `project` (id or name from the request) resolves against the registry: its
   * `path` becomes the spawn cwd of claude stages and the verify-phase cwd, and
   * its `checks` the verify fallback. Unresolvable → sandbox-only (deterministic
   * for demo/e2e).
   */
  async start(
    pipelineId: string,
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
     * the pipeline definition's `outputs:` for this run only — `void` suppresses even a
     * declared `pr`. Absent = inherit the definition (every existing caller).
     */
    taskOutput?: TaskOutput,
    /**
     * N2b: initial input content for the FIRST phase's `consumes` handoff — an
     * upstream chain artifact (or a chain's instructions). Written to
     * `<run>/context/input.md` (P1-T3: durable, files-as-truth, alongside any other
     * pipeline-level input) and threaded as the initial handoff source, exactly
     * like an inner-pipeline `produces` → `consumes` copy. Absent for every
     * existing caller (no behaviour change).
     */
    input?: string,
  ): Promise<PipelineRun> {
    // Throws PipelineNotFoundError / InvalidPipelineIdError when unknown → 404.
    const pipeline = await this.pipelines.get(pipelineId);

    // Claude-mode stages spawn real `claude -p` sessions — refuse the whole run
    // up front when the CLI can't start one (→ 503). Demo pipelines keep working.
    if (process.env.AGENT_RUNNER_MODE === "claude") {
      await this.preflight.assertAvailable();
    }

    const project = await this.resolveProject(projectRef);

    const startedMs = Date.now();
    const pipelineRunId = `${pipelineId}_${startedMs}`;
    const root = path.join(this.dir, pipelineRunId);
    await fs.mkdir(root, { recursive: true });
    // P1-T3 (Fáze 3): pipeline-level inputs live in a shared, read-only `context/`
    // folder off the run root — every stage symlinks it in (below) so the whole
    // run's inputs are available everywhere without duplicating them into each
    // stage's sandbox. Created unconditionally (even when this run carries no
    // chain input) so every stage's `context` symlink resolves to a real folder.
    const contextDir = path.join(root, "context");
    await fs.mkdir(contextDir, { recursive: true });

    const firstPhase = pipeline.phases[0];
    const run: PipelineRun = {
      pipelineRunId,
      pipelineId,
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
      ...(taskOutput ? { outputsOverride: this.toOutputsOverride(taskOutput, pipeline) } : {}),
    };
    this.runs.set(pipelineRunId, run);
    await this.writeAggregate(run);

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
    } else if (project && (await this.workspace.isGitRepo(project.path))) {
      try {
        run.workspace = await this.workspace.createWorktree({
          projectPath: project.path,
          runId: pipelineRunId,
          slug: pipelineId,
          // Phase 12.7: worktree OUTSIDE the repo/data tree (only artifacts stay under root).
          dir: await prepareWorktreeDir(pipelineRunId),
        });
        await this.writeAggregate(run);
      } catch (error) {
        if (!(error instanceof WorkspaceSetupError)) throw error;
        run.status = "failed";
        run.currentStage = null;
        await this.writeAggregate(run);
        this.log.error("pipeline run failed: worktree setup", {
          pipelineRunId,
          projectPath: project.path,
          err: error.message,
        });
        return run;
      }
    }

    this.log.info("starting pipeline run", {
      pipelineId,
      pipelineRunId,
      phases: pipeline.phases.length,
      projectPath: project?.path,
      branch: run.workspace?.branch,
    });

    // N2b: materialize the chain/operator input as the first phase's handoff. This
    // IS the pipeline-level input (P1-T3 investigation: no other file plays that
    // role — `readArtifact`'s allowlist never includes it and no resume path ever
    // re-derives it from disk, so it is read exactly once, right below, within this
    // same call). It lives in `context/` (durable, files-as-truth) alongside any
    // other pipeline-level input, and drive() copies it into the first stage's
    // `consumes` via the same placeHandoff path as any inner handoff.
    let initialHandoff: string | null = null;
    if (input !== undefined && pipeline.phases[0]?.consumes) {
      initialHandoff = path.join(contextDir, "input.md");
      await fs.writeFile(initialHandoff, input, "utf8");
      // Fáze 3: pipeline inputs are read-only for every phase — they are inputs of
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
    const firstCursor = pipeline.phases[0]?.id;
    void this.trace.run({ traceId, runId: pipelineRunId }, () =>
      initialHandoff && firstCursor
        ? this.drive(run, pipeline, project, {
            cursor: firstCursor,
            handoffSource: initialHandoff,
            retries: new Map(),
          })
        : this.drive(run, pipeline, project),
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
  private async projectForRun(run: PipelineRun): Promise<Project | null> {
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
  async resumeParked(pipelineRunId: string, note?: string): Promise<PipelineRun> {
    let run = this.runs.get(pipelineRunId);
    if (!run) {
      const fromDisk = await this.readAggregate(pipelineRunId);
      if (!fromDisk) throw new PipelineRunNotFoundError(pipelineRunId);
      this.runs.set(pipelineRunId, fromDisk);
      run = fromDisk;
    }
    // Phase 9 widens the resumable parkings from `retries`-only to `retries | limit`.
    const isLimit = run.parkedReason === "limit";
    if (run.status !== "parked" || (run.parkedReason !== "retries" && !isLimit) || !run.parked) {
      throw new RunNotRetriesParkedError(pipelineRunId);
    }
    const pipeline = await this.pipelines.get(run.pipelineId);
    const parked = run.parked;
    const phase = pipeline.phases.find((p) => p.id === parked.phaseId);
    // A retries-parking re-enters the loop back-edge (needs a loop); a limit-parking
    // re-runs the parked phase itself, so it only needs the phase to still exist.
    if (!phase) throw new RunNotRetriesParkedError(pipelineRunId);
    if (!isLimit && !phase.loop) throw new RunNotRetriesParkedError(pipelineRunId);

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
      ? this.recomputeHandoff(run, pipeline, cursor)
      : parked.failureFile;

    run.status = "running";
    delete run.parkedReason;
    delete run.parked;
    run.retries = Object.fromEntries(retries);
    run.currentStage = cursor;
    await this.writeAggregate(run);
    this.log.info("parked pipeline run resumed", {
      pipelineRunId,
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
      pipeline.phases.map((p) => p.id),
      { note: trimmed, failureTail },
    );
    const traceId = this.trace.getTraceId() ?? randomUUID();
    void this.trace.run({ traceId, runId: pipelineRunId }, () =>
      this.drive(run, pipeline, project, { cursor, handoffSource, retries, resumeContext }),
    );
    return run;
  }

  /**
   * Phase 9: the pipeline runs currently paused on the usage limit (each carries its
   * `resumeAt` + `limitResumeCycles`). The {@link LimitResumeService} scans this on a
   * tick and resumes the due ones.
   */
  listLimitPaused(): PipelineRun[] {
    return this.list().filter((r) => r.status === "paused-limit");
  }

  /**
   * Phase 9: auto-resume a limit-paused pipeline run. Bumps the resume-cycle counter,
   * discards any mid-stage paused stage record (so the resume scan / a restart can't
   * re-detect it), and re-drives from the current phase — re-running it fresh (with
   * resume-context once 9.3 lands). If the window is still exhausted the driver's
   * boundary check re-pauses it immediately (cheap, no token), burning one cycle.
   */
  async resumeLimitPaused(pipelineRunId: string): Promise<PipelineRun> {
    const run = this.runs.get(pipelineRunId) ?? (await this.readAggregate(pipelineRunId));
    if (!run) throw new PipelineRunNotFoundError(pipelineRunId);
    this.runs.set(pipelineRunId, run);
    if (run.status !== "paused-limit") return run;
    const pipeline = await this.pipelines.get(run.pipelineId);
    for (const s of run.stageRuns) {
      if (s.status === "paused-limit") await this.core.discardPausedLimit(s.runId).catch(() => {});
    }
    run.limitResumeCycles = (run.limitResumeCycles ?? 0) + 1;
    run.status = "running";
    run.resumeAt = null;
    await this.writeAggregate(run);
    const project = await this.projectForRun(run);
    const cursor = run.currentStage ?? pipeline.phases[0]?.id ?? null;
    const retries = new Map(Object.entries(run.retries ?? {}));
    this.log.info("auto-resumed limit-paused pipeline run", {
      pipelineRunId,
      phase: cursor,
      cycle: run.limitResumeCycles,
    });
    if (cursor) {
      const handoffSource = this.recomputeHandoff(run, pipeline, cursor);
      // Phase 9.3: the resumed phase is a continuation — prefix it with what's already
      // done + committed so it doesn't re-implement completed work.
      const resumeContext = await this.composeResumeContext(
        run,
        pipeline.phases.map((p) => p.id),
        {},
      );
      const traceId = this.trace.getTraceId() ?? randomUUID();
      void this.trace.run({ traceId, runId: pipelineRunId }, () =>
        this.drive(run, pipeline, project, { cursor, handoffSource, retries, resumeContext }),
      );
    }
    return run;
  }

  /**
   * Phase 9: park a limit-paused pipeline run that flapped past `LIMIT_RESUME_MAX`.
   * Durable, operator-resumable (`parkedReason: "limit"`, re-enters at the parked
   * phase). Writes a short flap note as the parked surface and discards any stale
   * paused stage record.
   */
  async parkLimitFlapped(pipelineRunId: string): Promise<PipelineRun> {
    const run = this.runs.get(pipelineRunId) ?? (await this.readAggregate(pipelineRunId));
    if (!run) throw new PipelineRunNotFoundError(pipelineRunId);
    this.runs.set(pipelineRunId, run);
    const phaseId = run.currentStage ?? run.stageRuns[run.stageRuns.length - 1]?.phaseId ?? "?";
    const cycles = run.limitResumeCycles ?? 0;
    const failureFile = path.join(run.cwd, `${phaseId}.limit.txt`);
    await fs
      .writeFile(
        failureFile,
        `Pipeline "${run.pipelineId}" paused on the usage limit; auto-resume flapped ${cycles} time(s) and was parked for review.\n`,
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
    this.log.warn("pipeline run parked after usage-limit flap", { pipelineRunId, phaseId, cycles });
    return run;
  }

  /**
   * Phase 9: the absolute handoff a re-driven phase should consume — the `produces`
   * file of the nearest *upstream* phase that emits one. Used by limit-resume and the
   * limit-parking resume, which re-enter mid-pipeline without the original drive's
   * in-memory `handoffSource`. Null when no upstream phase produces anything.
   */
  private recomputeHandoff(run: PipelineRun, pipeline: Pipeline, cursor: string): string | null {
    const order = pipeline.phases;
    const idx = order.findIndex((p) => p.id === cursor);
    for (let i = idx - 1; i >= 0; i--) {
      const ph = order[i];
      if (ph?.produces) {
        return path.join(run.cwd, this.latestStageDir(run, ph.id), ph.produces);
      }
    }
    return null;
  }

  list(): PipelineRun[] {
    const cutoff = Date.now() - RETENTION_MS;
    const out: PipelineRun[] = [];
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
  async listAll(): Promise<PipelineRun[]> {
    const byId = new Map<string, PipelineRun>();
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
      const parsed = PipelineRunSchema.safeParse(data);
      if (!parsed.success) continue;
      byId.set(parsed.data.pipelineRunId, parsed.data);
    }
    // In-memory wins: it carries the live `currentStage`/`status` of an active run.
    for (const [id, run] of this.runs) byId.set(id, run);
    return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  get(pipelineRunId: string): PipelineRun {
    const run = this.runs.get(pipelineRunId);
    if (!run) throw new PipelineRunNotFoundError(pipelineRunId);
    return run;
  }

  /**
   * Permanently delete a pipeline run. Each stage spawned through the core writes
   * its sidecar/log to the *runs dir root* (not the stage cwd), so removing the run
   * folder alone would orphan them — delete every stage's artifacts first, then the
   * folder (aggregate + per-phase sandboxes). Throws if the run is unknown.
   */
  async delete(pipelineRunId: string): Promise<void> {
    const run = this.runs.get(pipelineRunId) ?? (await this.readAggregate(pipelineRunId));
    if (!run) throw new PipelineRunNotFoundError(pipelineRunId);
    for (const stage of run.stageRuns) {
      // Escalation markers have no real run behind them; a missing sidecar is fine.
      await this.core.delete(stage.runId).catch(() => {});
    }
    this.runs.delete(pipelineRunId);
    // An `output`-parked run owns a pending `pipeline-output` approval keyed on this
    // pipelineRunId — resolve it (rejected, not routed back) so the queue doesn't keep
    // a card for a run that no longer exists.
    await this.approvals.cancelPendingForRun(pipelineRunId).catch(() => {});
    // Phase 3.1: drop the git worktree (and prune its metadata) BEFORE the folder
    // rm — rm-first would strand stale `.git/worktrees/*` in the project repo. The
    // branch is left intact (it may carry the PR). Best-effort; tolerant of a
    // worktree that's already gone.
    if (run.workspace && run.projectPath) {
      await this.workspace
        .removeWorktree({ projectPath: run.projectPath, worktreePath: run.workspace.path })
        .catch(() => {});
    }
    const root = this.resolveRunDir(pipelineRunId);
    if (root) await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }

  /** Read a stage's log by phase id (the most recent attempt of that phase). */
  async readStageLog(
    pipelineRunId: string,
    phaseId: string,
    offset: number,
  ): Promise<RunLogChunk> {
    // Fall back to the on-disk aggregate (like delete/readArtifact/resume): a finished
    // run is evicted from the in-memory registry once it ages past RETENTION_MS, but
    // its aggregate + per-stage logs persist — so the detail view can still tail them.
    const run = this.runs.get(pipelineRunId) ?? (await this.readAggregate(pipelineRunId));
    if (!run) throw new PipelineRunNotFoundError(pipelineRunId);
    // The in-flight stage isn't in `stageRuns` yet (that append is terminal-only),
    // so while this phase is the one executing, tail it by the live
    // `currentStageRunId` — that is the running attempt, not a stale earlier one.
    if (run.currentStage === phaseId && run.currentStageRunId) {
      return this.core.readLog(run.currentStageRunId, offset);
    }
    const stage = [...run.stageRuns].reverse().find((s) => s.phaseId === phaseId);
    if (!stage) throw new PipelineRunNotFoundError(`${pipelineRunId}/${phaseId}`);
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
  onStageLogAppend(pipelineRunId: string, phaseId: string, listener: () => void): () => void {
    return this.core.onLogAny((runId) => {
      const run = this.runs.get(pipelineRunId);
      if (!run) return;
      const live = run.currentStage === phaseId && run.currentStageRunId === runId;
      const past = run.stageRuns.some((s) => s.phaseId === phaseId && s.runId === runId);
      if (live || past) listener();
    });
  }

  /**
   * Read one whitelisted run artifact (Phase 3.3) by name. `name` must either be on
   * the global allowlist ({@link PIPELINE_RUN_ARTIFACTS}) or match the run's own
   * delivered `file` output (`outputsOverride`'s `from`, computed by the runner
   * itself from `phase.produces` — never request input) — anything else (incl. any
   * traversal attempt) returns null → 404; there is no generic file browser. The
   * diffstat lives in the run root; every other artifact is a phase's `produces`,
   * found in its stage sandbox. Returns null when the run is unknown or the file is
   * absent.
   */
  async readArtifact(
    pipelineRunId: string,
    name: string,
  ): Promise<{ name: PipelineRunArtifact["name"]; content: string } | null> {
    const root = this.resolveRunDir(pipelineRunId);
    if (!root) return null;
    const run = this.runs.get(pipelineRunId) ?? (await this.readAggregate(pipelineRunId));
    const fileOutputName = run?.outputsOverride?.find((o) => o.type === "file")?.from;
    const isAllowed =
      (PIPELINE_RUN_ARTIFACTS as readonly string[]).includes(name) || name === fileOutputName;
    if (!isAllowed) return null;
    const allowed = name as PipelineRunArtifact["name"];
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
   * Drive the phases in order. The cursor moves forward on success; on failure it
   * either takes the phase's back-edge (bounded by `maxRetries`) or fails the run.
   */
  private async drive(
    run: PipelineRun,
    pipeline: Pipeline,
    project: Project | null = null,
    resume?: {
      cursor: string;
      handoffSource: string | null;
      retries: Map<string, number>;
      /** Phase 9.3: resume-context for the FIRST re-driven phase (limit/parked resume). */
      resumeContext?: string;
    },
  ): Promise<void> {
    const byId = new Map(pipeline.phases.map((p) => [p.id, p]));
    const order = pipeline.phases;
    const phaseIds = order.map((p) => p.id);
    // The curated delegation catalog for every stage of this run: the agents THIS
    // pipeline actually uses. Passing the whole agent library into `--agents` would
    // overflow the OS argv limit (spawn E2BIG); a stage may still delegate within its
    // own pipeline's roster (plus ZIBBY's operational core, folded in downstream).
    const delegates = order.map((p) => p.agent).filter((a): a is string => Boolean(a));
    const retries = resume?.retries ?? new Map<string, number>();
    // Absolute path of the file to feed into the next phase's `consumes` input.
    let handoffSource: string | null = resume?.handoffSource ?? null;
    let cursor: string | null = resume?.cursor ?? order[0]?.id ?? null;
    // Phase 9.3: a continuation prefix for the next phase to run — set on a re-driven
    // resume (limit/parked) and on a loop back-edge; consumed once, then cleared.
    let pendingResumeContext: string | null = resume?.resumeContext ?? null;

    while (cursor) {
      const phase = byId.get(cursor);
      if (!phase) break; // defensive; superRefine guarantees targets exist
      run.currentStage = phase.id;

      // Phase 9 (boundary pause, decision 3b): before spending a stage, halt if the
      // usage window is exhausted — persist the aggregate `paused-limit` with the
      // earliest reset as `resumeAt` and return without spawning. Auto-resume re-drives
      // from this same cursor. Fail-open: a stale/headroom reading just proceeds, and a
      // wrongly-dispatched stage that dies on a limit is caught by the mid-stage path.
      const boundary = await this.limits.windowExhausted();
      if (boundary.exhausted) {
        run.status = "paused-limit";
        run.resumeAt = boundary.resumeAt ?? (await this.limits.resolveResumeAt(null));
        run.limitResumeCycles = run.limitResumeCycles ?? 0;
        run.retries = Object.fromEntries(retries);
        await this.writeAggregate(run);
        await this.writeProgress(run, phaseIds);
        this.log.warn("pipeline run paused on usage limit (phase boundary)", {
          phase: phase.id,
          resumeAt: run.resumeAt,
        });
        return;
      }

      const attempt = (retries.get(phase.id) ?? 0) + 1;
      // Sequential sandbox numbering: every dispatch appends exactly one `stageRuns`
      // entry when it settles (there is no same-entry retry path in this machine),
      // so `length + 1` numbers the folders in call order — a loop back-edge's
      // second run of the same phase gets its own folder instead of overwriting the
      // first. A synthetic escalation marker also occupies a slot, which leaves a
      // gap in the numbering, never a clash.
      const stageCwd = path.join(
        run.cwd,
        this.stageDirName(run.stageRuns.length + 1, phase.id),
      );
      await fs.mkdir(stageCwd, { recursive: true });
      // P1-T3 (Fáze 3): every stage gets the run's shared `context/` folder linked
      // in, relative like the handoff symlink (P1-T2) — pipeline-level inputs are
      // visible from any stage without copying them into each sandbox. `start()`
      // creates `context/` unconditionally for every run, so this is unconditional
      // too; a link left dangling has nothing behind it, same as an unused handoff.
      await fs
        .symlink(path.relative(stageCwd, path.join(run.cwd, "context")), path.join(stageCwd, "context"))
        .catch(() => {});
      await this.placeHandoff(handoffSource, stageCwd, phase);

      this.log.info("pipeline phase starting", {
        phase: phase.id,
        type: phase.type,
        agent: phase.agent,
        attempt,
      });
      const stageResumeContext = pendingResumeContext ?? undefined;
      pendingResumeContext = null; // consumed by this phase only
      const stageRun = await this.runStage(
        run,
        phase,
        stageCwd,
        attempt,
        project,
        stageResumeContext,
        delegates,
      );
      // The stage has reached a terminal/paused state and (when terminal) is about
      // to be appended to `stageRuns` — its log is readable from there now, so drop
      // the live pointer the running attempt used.
      run.currentStageRunId = undefined;

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
        this.log.warn("pipeline run paused on usage limit (mid-stage)", {
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
      run.stageRuns.push(stageRun);
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
          refs: { pipelineId: run.pipelineId, status: verdict },
        });
        if (verdict !== "pass") qualifyFail = { verdict };
      }

      if (stageRun.status === "done" && !qualifyFail) {
        this.log.info("pipeline phase done", { phase: phase.id, attempt });
        // Phase 12.6: a `verify` phase passed → record the commands it ran (runner-set
        // from real execution, not an agent claim) so a goal maker can skip an identical
        // second verification (goal-runner.makerAlreadyVerified).
        if (phase.type === "verify") {
          run.verifyCommands = phase.commands ?? project?.checks ?? [...DEFAULT_VERIFY_CHECKS];
        }
        // Phase 9.3: checkpoint the green phase on the run branch (worktree only;
        // a clean tree / non-git run → no-op). Records the sha on the aggregate.
        // checkpointPhase only READS `phase.produces` (for the commit summary's first
        // line) and commits the WORKTREE, a separate tree from this stage's sandbox —
        // it never writes the produces file, so ordering the chmod after it is safe
        // either way; kept after regardless, per the plan's conservative default.
        await this.checkpointPhase(run, phase, stageCwd, attempt);
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
        continue;
      }

      // Stage failed, was interrupted, OR a qualify phase returned gap/drift.
      const loop = phase.loop;
      // drift re-plans (Architekt) via driftTo; gap / a real error fix in place (Kodér).
      const retryTarget =
        qualifyFail?.verdict === "drift" ? (loop?.driftTo ?? loop?.to) : loop?.to;
      if (loop && (retries.get(phase.id) ?? 0) < loop.maxRetries) {
        retries.set(phase.id, (retries.get(phase.id) ?? 0) + 1);
        this.log.warn("pipeline phase failed; retrying", {
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
        this.log.warn("pipeline run parked (retries exhausted)", {
          phase: phase.id,
          attempts: attempt,
        });
        return;
      }

      // No loop, or retries exhausted: escalate (surface), then fall through.
      if (loop?.escalate) {
        this.log.warn("pipeline phase escalated (retries exhausted)", { phase: phase.id, attempt });
        run.stageRuns.push({
          phaseId: phase.id,
          runId: `${run.pipelineRunId}.${phase.id}.escalated`,
          attempt,
          status: "error",
        });
      }
      if (!loop || loop.then === "fail") {
        this.log.error("pipeline phase failed; failing run", {
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
      // Chain finished green — hand off to the pipeline's delivery sinks. A `pr`
      // output parks the run on the PR gate; the run only reaches `done` once every
      // output is delivered (handled inside runOutputs).
      await this.runOutputs(run, pipeline, 0, phaseIds);
      return;
    }
    run.currentStage = null;
    await this.writeAggregate(run);
    await this.writeProgress(run, phaseIds);
    this.log.info("pipeline run finished", { status: run.status, stages: run.stageRuns.length });
  }

  /**
   * Deliver the pipeline's outputs (terminal sinks) starting at `from`. `file` sinks
   * run immediately (deterministic, Tier-1); a `pr` sink parks the whole run on the PR
   * gate and returns — it resumes here at the same index when approved. Once every
   * output is delivered the run finishes `done`. Outputs are post-chain delivery: a
   * failed sink is logged, never fails the (already-green) run — the branch work is
   * committed and safe.
   */
  private async runOutputs(
    run: PipelineRun,
    pipeline: Pipeline,
    from: number,
    phaseIds: string[],
  ): Promise<void> {
    const outputs = run.outputsOverride ?? pipeline.outputs ?? [];
    for (let i = from; i < outputs.length; i++) {
      const output = outputs[i];
      if (!output) continue;
      if (output.type === "pr") {
        await this.parkOnPrOutput(run, pipeline, output, i, phaseIds);
        return; // the run is parked; it resumes at index i on approval
      }
      await this.deliverFileOutput(run, pipeline, output);
    }
    run.status = "done";
    run.currentStage = null;
    await this.writeAggregate(run);
    await this.writeProgress(run, phaseIds);
    this.log.info("pipeline run finished", { status: run.status, stages: run.stageRuns.length });
  }

  /**
   * Project a directed task's output choice onto this pipeline's sink array. A task
   * carries no `from` (the pipeline owns its handoff names), so the source is the
   * pipeline's terminal artifact — the last phase that `produces` anything (falling
   * back to a conventional name when the pipeline produces nothing, in which case a
   * `pr` sink simply has no body to read and titles off the pipeline id). `void` →
   * `[]` (deliver nothing, suppressing even a declared PR).
   */
  private toOutputsOverride(taskOutput: TaskOutput, pipeline: Pipeline): PipelineOutput[] {
    if (taskOutput.type === "void") return [];
    const from = [...pipeline.phases].reverse().find((p) => p.produces)?.produces ?? "result.md";
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
  private latestStageDir(run: PipelineRun, phaseId: string): string {
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
    run: PipelineRun,
    pipeline: Pipeline,
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
      const phase = pipeline.phases.find((p) => p.produces === fromName);
      if (!phase) return null;
      return path.join(run.cwd, this.latestStageDir(run, phase.id), fromName);
    }
    const dest = path.join(outputDir, fromName);
    const alreadyLinked = await fs
      .lstat(dest)
      .then(() => true)
      .catch(() => false);
    if (!alreadyLinked) {
      const phase = pipeline.phases.find((p) => p.produces === fromName);
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
    run: PipelineRun,
    pipeline: Pipeline,
    output: Extract<PipelineOutput, { type: "file" }>,
  ): Promise<void> {
    const source = await this.resolveOutputSource(run, pipeline, output.from);
    const content = source ? await fs.readFile(source, "utf8").catch(() => null) : null;
    if (content === null) {
      this.log.warn("file output skipped — source artifact missing", {
        pipelineRunId: run.pipelineRunId,
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
            pipelineRunId: run.pipelineRunId,
            to: output.to,
            err: error instanceof Error ? error.message : String(error),
          });
          return false;
        });
      if (delivered) {
        this.log.info("file output delivered to vault", {
          pipelineRunId: run.pipelineRunId,
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
        pipelineRunId: run.pipelineRunId,
        to: output.to,
      });
      return;
    }
    const dest = this.resolveInside(base, output.to);
    if (!dest) {
      this.log.warn("project file output skipped — destination escapes the project", {
        pipelineRunId: run.pipelineRunId,
        to: output.to,
      });
      return;
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, content, "utf8");
    this.log.info("file output delivered to project", {
      pipelineRunId: run.pipelineRunId,
      to: output.to,
    });
    await this.recordArtifact(run, "project-file", output.from, output.to);
  }

  /**
   * Write the durable provenance record for a delivered output (N2a). Best-effort
   * by contract — the registry must never fail an (already-green) delivery; a
   * write error is logged and the delivery stands. Stable id ⇒ an idempotent
   * re-delivery replaces its record instead of duplicating it.
   */
  private async recordArtifact(
    run: PipelineRun,
    kind: ArtifactKind,
    from: string,
    locator: string,
  ): Promise<void> {
    const project = await this.projectForRun(run).catch((): Project | null => null);
    const projectId = project && project.id !== "unregistered" ? project.id : undefined;
    await this.artifacts
      .record({
        id: artifactRecordId(run.pipelineRunId, kind, from),
        kind,
        locator,
        from,
        producedBy: {
          runRef: run.pipelineRunId,
          pipelineId: run.pipelineId,
          ...(run.taskId ? { taskId: run.taskId } : {}),
          ...(projectId ? { projectId } : {}),
        },
        createdAt: new Date().toISOString(),
      })
      .catch((error) => {
        this.log.warn("artifact record failed (soft) — delivery stands", {
          pipelineRunId: run.pipelineRunId,
          from,
          err: error instanceof Error ? error.message : String(error),
        });
      });
  }

  /**
   * Park the run on the PR gate for a `pr` output. Structural Tier-3 — the PR is the
   * gate, system-owned (no agent config can weaken it). Persists `output` parking
   * (durable across restart) with the diffstat surface, and requests a
   * `pipeline-output` approval keyed on the pipelineRunId.
   */
  private async parkOnPrOutput(
    run: PipelineRun,
    pipeline: Pipeline,
    output: Extract<PipelineOutput, { type: "pr" }>,
    index: number,
    phaseIds: string[],
  ): Promise<void> {
    run.status = "parked";
    run.parkedReason = "output";
    run.pendingOutput = { index };
    run.currentStage = null;
    // Assemble the Tier-3 decision surface: the branch-vs-base diffstat next to the run.
    if (run.workspace) {
      const diff = await this.workspace
        .diffstat({ worktreePath: run.workspace.path, baseRef: run.workspace.baseRef })
        .catch(() => "");
      if (diff)
        await fs.writeFile(path.join(run.cwd, "diffstat.txt"), diff, "utf8").catch(() => {});
    }
    const source = await this.resolveOutputSource(run, pipeline, output.from);
    const content = source ? await fs.readFile(source, "utf8").catch(() => "") : "";
    const { title } = this.parsePrMarkdown(content);
    // Write the PR draft at PARK time so the gate card can show what's about to be
    // published (the web RunPrGatePanel reads `pr-draft.md`); openPrOutput reuses it.
    await fs
      .writeFile(
        path.join(run.cwd, "pr-draft.md"),
        content.trim() ? content : `# ${title || run.pipelineId}\n`,
        "utf8",
      )
      .catch(() => {});
    await this.writeAggregate(run);
    await this.writeProgress(run, phaseIds);
    await this.approvals.requestApproval({
      runId: run.pipelineRunId,
      kind: "pipeline-output",
      skill: "ZIBBY",
      action: "pr.open",
      detail: title || `Otevřít PR pro běh ${run.pipelineRunId}`,
      risk: "medium",
    });
    this.log.info("pipeline run parked on PR output gate", {
      pipelineRunId: run.pipelineRunId,
      index,
    });
  }

  /**
   * Resume an `output`-parked run after the operator's decision on its PR gate.
   * Approved → run the gated push and continue any later outputs; rejected → leave the
   * branch work without a PR and continue. Either way the run finishes once the
   * remaining outputs are delivered. Never throws (the approval flow must not crash).
   */
  private async resumeOutput(
    pipelineRunId: string,
    decision: "approved" | "rejected",
  ): Promise<void> {
    try {
      const run = this.runs.get(pipelineRunId) ?? (await this.readAggregate(pipelineRunId));
      if (!run || run.parkedReason !== "output" || !run.pendingOutput) {
        this.log.warn("output resume skipped (run not output-parked)", { pipelineRunId, decision });
        return;
      }
      this.runs.set(run.pipelineRunId, run);
      const pipeline = await this.pipelines.get(run.pipelineId);
      const phaseIds = pipeline.phases.map((p) => p.id);
      const index = run.pendingOutput.index;
      const output = (run.outputsOverride ?? pipeline.outputs ?? [])[index];
      run.status = "running";
      delete run.parkedReason;
      delete run.pendingOutput;
      await this.writeAggregate(run);
      if (decision === "approved" && output?.type === "pr") {
        await this.openPrOutput(run, pipeline, output);
      } else {
        this.log.info("PR output declined — branch work left without a PR", { pipelineRunId });
      }
      await this.runOutputs(run, pipeline, index + 1, phaseIds);
    } catch (error) {
      this.log.error("output resume failed", {
        pipelineRunId,
        decision,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Execute an approved `pr` output: write the PR draft and run the gated push. */
  private async openPrOutput(
    run: PipelineRun,
    pipeline: Pipeline,
    output: Extract<PipelineOutput, { type: "pr" }>,
  ): Promise<void> {
    const source = await this.resolveOutputSource(run, pipeline, output.from);
    const content = source ? await fs.readFile(source, "utf8").catch(() => "") : "";
    const { title } = this.parsePrMarkdown(content);
    // Keep `pr-draft.md` as the durable run artifact the web detail serves.
    const bodyFile = path.join(run.cwd, "pr-draft.md");
    await fs
      .writeFile(bodyFile, content.trim() ? content : `# ${title || run.pipelineId}\n`, "utf8")
      .catch(() => {});
    if (!run.workspace) {
      this.log.warn("PR output approved but run has no worktree; nothing pushed", {
        pipelineRunId: run.pipelineRunId,
      });
      return;
    }
    const result = await this.workspace.openPr({
      cwd: run.workspace.path,
      title: title || run.pipelineId,
      bodyFile,
    });
    if (result) {
      this.log.info("PR output opened", { pipelineRunId: run.pipelineRunId, url: result.url });
      await this.recordArtifact(run, "pr", output.from, result.url);
    } else {
      this.log.warn("PR output push failed (soft) — branch work is committed and safe", {
        pipelineRunId: run.pipelineRunId,
      });
    }
  }

  /**
   * Phase 9.3 — checkpoint a green phase on the run branch (worktree only). Skips
   * cleanly when there is no worktree or the tree is clean; on success records the sha
   * on `run.checkpoints`. The commit message summary is the first line of the phase's
   * `produces` file when present, else "attempt N". NEVER pushes.
   */
  private async checkpointPhase(
    run: PipelineRun,
    phase: PipelinePhase,
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

  /** Rewrite `<run cwd>/PROGRESS.md` from the aggregate (pure {@link renderProgress}). */
  private async writeProgress(run: PipelineRun, phaseIds: readonly string[]): Promise<void> {
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
    run: PipelineRun,
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
  private escalationFor(phase: PipelinePhase, attempt: number): PhaseEscalation | null {
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
    run: PipelineRun,
    phase: PipelinePhase,
    stageCwd: string,
    attempt: number,
    project: Project | null,
    resumeContext?: string,
    delegates?: readonly string[],
  ): Promise<StageRun> {
    const escalation = this.escalationFor(phase, attempt);
    if (escalation) {
      this.log.info("applying escalation rung", { phase: phase.id, attempt, ...escalation });
    }
    const { command, args, spawnCwd } = await this.buildStageCommand(
      phase,
      stageCwd,
      project,
      escalation,
      run.workspace?.path,
      run.matchedTerms,
      resumeContext,
      delegates,
    );
    // Materialize enabled custom commands into the stage's working tree (worktree
    // for a project run, else the sandbox) so commands resolve; best-effort.
    await this.commandMaterializer.materialize(spawnCwd ?? stageCwd);
    // Per-project env + secrets injected into this stage's process (Phase D).
    const env = await this.resolveProjectEnv(project);
    const rec = await this.core.start({
      kind: "pipeline-stage",
      ownerId: `${run.pipelineRunId}.${phase.id}`,
      command,
      args,
      cwd: stageCwd,
      ...(spawnCwd ? { spawnCwd } : {}),
      ...(env ? { env } : {}),
      extra: { pipelineRunId: run.pipelineRunId, phaseId: phase.id, attempt },
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
   * Variant B gate for pipeline stages. A live stage announced an external-effect
   * action and is blocking on its decision file: evaluate it against the phase
   * agent's rules (plus the locked floor) and steer the child. `ask` parks the
   * whole pipeline run (the driver's await rides through the pause) and raises a
   * `pipeline-stage` approval keyed by the STAGE run id. Failures fail safe to deny.
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
      const run = this.runs.get(rec.pipelineRunId);
      if (!run) throw new PipelineRunNotFoundError(rec.pipelineRunId);
      const pipeline = await this.pipelines.get(run.pipelineId);
      const phase = pipeline.phases.find((p) => p.id === rec.phaseId);
      if (!phase) throw new Error(`Phase "${rec.phaseId}" not found in "${run.pipelineId}"`);
      // Verify phases never spawn claude, so they can't raise intents — an
      // agent-less phase here is a malformed signal; the catch denies it.
      if (!phase.agent) throw new Error(`Phase "${rec.phaseId}" carries no agent`);
      const agent = await this.agents.get(phase.agent);
      const rules = await this.gates.rulesForAgent({
        gates: agent.gates,
        requires_approval: agent.requires_approval,
      });
      const evaluation = this.gates.evaluate(rules, action);
      this.log.info("evaluating mid-run stage intent", {
        pipelineRunId: run.pipelineRunId,
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
          kind: "pipeline-stage",
          skill: agent.name ?? agent.id,
          action: action.action,
          detail: action.context ?? `Pipeline "${run.pipelineId}", fáze "${rec.phaseId}"`,
          risk: agent.risk ?? "medium",
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
    status: PipelineRun["status"],
  ): Promise<void> {
    const rec = this.core.get(stageRunId);
    const run = this.runs.get(rec.pipelineRunId);
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
    phase: PipelinePhase,
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

  /** Write the failed stage's log tail as the handoff context for the retry. */
  private async writeFailureContext(
    run: PipelineRun,
    phase: PipelinePhase,
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
    phase: PipelinePhase,
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
    /** Curated `--agents` delegation roster (this pipeline's stage agents) — keeps the
     *  whole agent library off argv (spawn E2BIG). */
    delegates?: readonly string[],
  ): Promise<{ command: string; args: string[]; spawnCwd?: string }> {
    const spawnCwd = worktreePath ?? project?.path;
    // Verify phases are deterministic shell checks — identical in demo and
    // claude mode (no model, no tokens, no intents, no preflight). They run in
    // the run's worktree (or project checkout) when one was resolved, else the sandbox.
    if (phase.type === "verify") {
      // Phase 10.2: the verify-command assembly is lifted into a shared helper so the
      // pipeline verify stage and the goal `checks` verifier resolve checks identically.
      return buildVerifyCommand({
        commands: phase.commands,
        projectChecks: project?.checks,
        spawnCwd,
      });
    }
    if (process.env.AGENT_RUNNER_MODE === "claude") {
      // The phase's agent drives the stage: its instructions become the session
      // system prompt; the task tells it to consume the handoff and produce the
      // next one. The demo path covers the pipeline machinery without tokens.
      if (!phase.agent) throw new Error(`Agent phase "${phase.id}" carries no agent`);
      const agent = await this.agents.get(phase.agent);
      // Handoff paths are passed ABSOLUTE: with a project resolved the session
      // spawns inside the checkout (its real CLAUDE.md/.claude context loads),
      // so anything sandbox-relative would silently resolve against the repo.
      const consumesAbs = phase.consumes ? path.join(cwd, phase.consumes) : null;
      const producesAbs = phase.produces ? path.join(cwd, phase.produces) : null;
      const task = buildStageTask({
        phaseId: phase.id,
        consumesAbs,
        producesAbs,
        qualify: phase.qualify,
      });
      // Memory grounding (Phase 4): per-stage so each phase's agent gets the North
      // Star + relevant MOCs + the project note. Fail-open ("" on any error).
      const grounding = await this.grounding.compose({
        task,
        projectId: project?.id,
        matchedTerms,
      });
      // P1-T2: `cwd` is THIS stage's own sandbox folder, a subdirectory of the run
      // root (`path.dirname(cwd)`). The handoff into `consumes` is now a relative
      // SYMLINK whose target can live in a PREVIOUS phase's sibling sandbox — reading
      // through it needs the whole run root granted, not just this stage's own
      // folder. With no `consumes` there's nothing cross-folder to read; the
      // narrower existing grant (just this stage's own sandbox, so the session can
      // still write `produces` back into it) applies when the session spawns
      // elsewhere (worktree/project).
      const grantDirs = phase.consumes
        ? [path.dirname(cwd)]
        : spawnCwd
          ? [cwd]
          : undefined;
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
        systemPromptDir: cwd,
        // Spawn in stream-json mode so the stage log captures the agent's whole
        // run (thinking + tool calls), flattened by the core's formatLine — not
        // just claude's final message. Mirrors the agent runner.
        streamTranscript: true,
      });
      return spawnCwd ? { ...built, spawnCwd } : built;
    }
    const script =
      process.env.PIPELINE_DEMO_STAGE_SCRIPT ?? path.resolve(__dirname, "demo-stage.mjs");
    return {
      command: process.execPath,
      args: [script, cwd, phase.id, phase.produces ?? "", phase.consumes ?? ""],
    };
  }

  /** The run's folder inside the runs dir, or null if the id would escape it. */
  private resolveRunDir(pipelineRunId: string): string | null {
    const dir = path.resolve(this.dir, pipelineRunId);
    if (path.dirname(dir) !== this.dir) return null;
    return dir;
  }

  /** Read a run's aggregate `run.json` from disk (for a run dropped from memory). */
  private async readAggregate(pipelineRunId: string): Promise<PipelineRun | null> {
    const root = this.resolveRunDir(pipelineRunId);
    if (!root) return null;
    const raw = await fs.readFile(path.join(root, AGGREGATE_FILE), "utf8").catch(() => null);
    if (raw === null) return null;
    try {
      const parsed = PipelineRunSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Subscribe to aggregate transitions of every pipeline run. Backs the unified
   * `/api/events` SSE channel; returns an unsubscribe for the controller to call
   * when the stream closes.
   */
  onRunStatus(listener: (run: PipelineRun) => void): () => void {
    this.events.on("status", listener);
    return () => this.events.off("status", listener);
  }

  private async writeAggregate(run: PipelineRun): Promise<void> {
    await fs
      .writeFile(path.join(run.cwd, AGGREGATE_FILE), JSON.stringify(run), "utf8")
      .catch(() => {
        // Best-effort: a failed write degrades restart fidelity, not the run.
      });
    // Persisting is the transition point — notify the status channel after it so a
    // subscriber that refetches sees the same state we just wrote to disk.
    this.events.emit("status", run);
  }

  /** Rebuild aggregates from `<runRoot>/run.json` sidecars; a mid-flight run fails. */
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
      const parsed = PipelineRunSchema.safeParse(data);
      if (!parsed.success) continue;
      let run = parsed.data;
      // A run left "running" lost its mid-flight child with the previous backend.
      // An APPROVAL-parked run is the same situation (its blocking child died
      // with the API) → honest reconciliation is `failed`. A RETRIES-parked run
      // has no child at all — it is durable and stays parked, resumable. A
      // `paused-limit` aggregate (Phase 9) is likewise durable: a mid-stage pause's
      // stage record (with its stashed spec) is rebuilt by core.init above, and a
      // boundary pause has no child at all — both survive by status alone, so they
      // fall through and stay resumable by the auto-resume tick.
      // `output` parking (a PR-gate wait after the chain already finished) has no live
      // child either — it is durable like `retries` and survives the restart parked.
      const approvalParked =
        run.status === "parked" && run.parkedReason !== "retries" && run.parkedReason !== "output";
      if (run.status === "running" || approvalParked) {
        run = {
          ...run,
          status: "failed",
          currentStage: null,
          parkedReason: undefined,
          parked: undefined,
        };
        await this.writeAggregate(run);
      }
      this.runs.set(run.pipelineRunId, run);
    }
  }
}
