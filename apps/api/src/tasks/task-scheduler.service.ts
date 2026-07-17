import { randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from "@nestjs/common";
import type {
  AgentRun,
  Attachment,
  ChainRun,
  CreateTaskInput,
  CreateTaskResult,
  GoalRun,
  Pipeline,
  PipelineRun,
  Project,
  ScheduledTask,
  SubsystemId,
  TaskOutcome,
  TaskOutput,
  TaskTarget,
} from "@zibby/contracts";
import { ORCHESTRATOR_TARGET, SUBSYSTEMS } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import type { AttachmentSetRefProvider } from "./attachment-set-ref-provider";
import { ATTACHMENT_SET_REF_PROVIDER } from "./attachment-set-ref-provider";
import { AgentRunnerService, type RunAttachments } from "../agents/agent-runner.service";
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service";
import { type BudgetOverMetrics, BudgetService } from "../budget/budget.service";
import { ChainRunnerService } from "../chains/chain-runner.service";
import { GateEvaluatorService } from "../gates/gate-evaluator.service";
import { LimitsService } from "../limits/limits.service";
import { GoalRunnerService } from "../goals/goal-runner.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { matchProject } from "../projects/project-matcher";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { withPathLock } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { normalizeSummary } from "../shared/text/normalize-summary";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { TickingWatcherBase } from "../shared/ticking-watcher-base";
import { SystemConfigStore } from "../system/system-config.store";
import { AttachmentStorageService } from "./attachment-storage.service";
import { ClaudeCliTaskNamer, deriveTitleFallback } from "./claude-cli-task-namer";
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";
import { TaskClassifierService } from "./task-classifier.service";
import { TaskOutputService } from "./task-output.service";
import { sumStageCosts } from "./task-runs.service";

/** A create input with its attachment set resolved once (Task 6 — resolve, then thread). */
type CreateTaskInputResolved = CreateTaskInput & { attachments: Attachment[] };

/** Thrown when there is nothing to route to (empty catalog) → the controller maps it to 422. */
export class EmptyCatalogError extends Error {
  constructor() {
    super("No agents or pipelines available to route to");
    this.name = "EmptyCatalogError";
  }
}

/**
 * Phase 91 — thrown when a task explicitly targets a subsystem with ZERO owned
 * pipelines. A described task must never silently no-op (Law 5), and a mandate
 * without capability shouldn't pretend to execute (deliberate v1 floor: this does
 * NOT fall back to the orchestrator) — so it surfaces as a clear, immediate,
 * Czech-language validation rejection instead. The controller maps it to 422,
 * mirroring {@link EmptyCatalogError}.
 */
export class SubsystemEmptyRosterError extends Error {
  constructor(subsystemName: string) {
    super(`Subsystém ${subsystemName} zatím nemá žádnou pipeline.`);
    this.name = "SubsystemEmptyRosterError";
  }
}

/** Outcome summaries keep to one short, readable line. */
const SUMMARY_MAX_CHARS = 200;

/** The action name the spend-past-cap floor rule keys on (decision 5). */
const SPEND_PAST_CAP = "spend-past-cap";

/** M8: total dispatch attempts for a transient failure before the task dead-letters. */
const MAX_DISPATCH_ATTEMPTS = 3;
/** M8: base backoff (ms) for a retried dispatch; the nth retry waits `base * 2^(n-1)`. */
const DISPATCH_BACKOFF_MS = 30_000;

/** Task 9: an attachment set with no referencing task is orphaned once past this age. */
const ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;

/** Agent run statuses that free a concurrency slot. */
const TERMINAL_AGENT = new Set<AgentRun["status"]>(["done", "error", "interrupted"]);
/** Pipeline run statuses that free a concurrency slot. */
const TERMINAL_PIPELINE = new Set<PipelineRun["status"]>(["done", "failed"]);
/** Goal run statuses that free a concurrency slot (Phase 10). */
const TERMINAL_GOAL = new Set<GoalRun["status"]>(["done", "failed"]);
/** Chain run statuses that free a concurrency slot (Phase 05). */
const TERMINAL_CHAIN = new Set<ChainRun["status"]>(["done", "failed"]);

/**
 * The deferred-task daemon. {@link createTask} is the single action behind the New
 * Task dialog: a task with no (or a past) `scheduledAt` is classified and dispatched
 * immediately; a future `scheduledAt` is parked in storage for the once-a-minute
 * {@link tick} to fire when due. Dispatch routes through the normal runners — so a
 * scheduled task still hits the approval gate exactly like an immediate one.
 *
 * Phase 8: before any immediate or fired dispatch, the task is attributed to an
 * engagement ({@link matchProject}, deterministic + token-free) and run through the
 * budget/concurrency guard ({@link attemptDispatch}). Over a budget cap → the task is
 * HELD behind a Tier-3 `spend-past-cap` approval (Law 3: no autonomous spend past
 * budget). At a project's `maxConcurrent` → the task is QUEUED (FIFO bookkeeping, no
 * approval) and drained when one of that project's runs reaches a terminal state.
 *
 * The heartbeat mirrors the automations {@link SchedulerService}: a tick of 0 (the
 * test default) disables the loop so tests drive {@link tick} directly.
 */
@Injectable()
export class TaskSchedulerService
  extends TickingWatcherBase
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly unsubscribes: Array<() => void> = [];
  protected readonly log: ScopedLogger;
  /**
   * Task ids the operator has approved to spend past budget (release-once). A
   * released task that has to wait for a concurrency slot re-enters the queue, and
   * the drain must NOT re-hold it for the same overage — it skips the budget check
   * for ids in this set, then clears the id once it actually dispatches. In-memory
   * by design: the approval record is the durable source of truth across restart.
   */
  private readonly budgetApproved = new Set<string>();

  constructor(
    private readonly storage: ScheduledTasksStorageService,
    private readonly classifier: TaskClassifierService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly pipelinesStore: PipelinesStorageService,
    private readonly goalRunner: GoalRunnerService,
    private readonly chainRunner: ChainRunnerService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
    private readonly activity: ActivityLogService,
    private readonly projects: ProjectsStorageService,
    private readonly resolved: ResolvedProjectService,
    private readonly budget: BudgetService,
    private readonly approvals: ApprovalsService,
    private readonly gates: GateEvaluatorService,
    private readonly limits: LimitsService,
    private readonly taskOutput: TaskOutputService,
    private readonly systemConfig: SystemConfigStore,
    private readonly namer: ClaudeCliTaskNamer,
    private readonly attachmentStorage: AttachmentStorageService,
    /**
     * Phase 116b: extra contributors to the sweep's "keep" set — e.g. a `task`-target
     * automation, which references an attachment set without ever becoming a
     * `ScheduledTask` until it fires (see `AttachmentSetRefProvider`). Optional and
     * defaulted so every pre-existing caller/test (constructing this service
     * directly, with no DI container) is unaffected.
     */
    @Optional()
    @Inject(ATTACHMENT_SET_REF_PROVIDER)
    private readonly attachmentRefProviders: AttachmentSetRefProvider[] = [],
  ) {
    super();
    this.log = logger.child(TaskSchedulerService.name);
  }

  onModuleInit(): void {
    // Fast path of the outcome write-back + the concurrency-queue drain: a terminal
    // run carrying a taskId writes its verdict onto the task record, and ANY terminal
    // run frees a slot that a queued task for the same engagement can take.
    this.unsubscribes.push(
      this.agentRunner.onRunStatus((run) => {
        if (run.taskId) void this.writeAgentOutcome(run.taskId, run);
        if (TERMINAL_AGENT.has(run.status)) void this.drainQueues();
      }),
      this.pipelineRunner.onRunStatus((run) => {
        if (run.taskId) void this.writePipelineOutcome(run.taskId, run);
        if (TERMINAL_PIPELINE.has(run.status)) void this.drainQueues();
      }),
      this.goalRunner.onRunStatus((run) => {
        if (run.taskId) void this.writeGoalOutcome(run.taskId, run);
        if (TERMINAL_GOAL.has(run.status)) void this.drainQueues();
      }),
      this.chainRunner.onRunStatus((run) => {
        if (run.taskId) void this.writeChainOutcome(run.taskId, run);
        if (TERMINAL_CHAIN.has(run.status)) void this.drainQueues();
      }),
    );

    // The kind-"task" runner: a held task's `spend-past-cap` approval resumes it
    // (dispatch once, past the cap) or cancels it. Registered here so approving a
    // held task is never a silent no-op (the Phase-5 channel-runner lesson).
    const runner: ResumableRunner = {
      resume: (taskId) => this.releaseHeld(taskId),
      cancel: (taskId) => void this.storage.cancel(taskId),
    };
    this.approvals.register("task", runner);

    // Heartbeat from the operator-owned system config (default 30s; `0` disables it,
    // the test default). Re-arm live when the config changes (no restart needed).
    this.arm();
    this.unsubscribes.push(this.systemConfig.onChange(() => this.arm()));
  }

  protected tickMs(): number {
    return this.systemConfig.current().taskTickMs;
  }

  /** The timer-driven path — goes through the base's skip-if-in-flight guard. */
  protected async runTick(now?: Date): Promise<void> {
    await this.tick(now);
  }

  /** (Re-)arm the heartbeat from `systemConfig.taskTickMs`; `0` leaves it disabled. */
  protected override arm(): void {
    super.arm();
    const tickMs = this.tickMs();
    if (tickMs > 0) {
      this.log.info("task scheduler started", { tickMs });
    } else {
      this.log.debug("task scheduler tick disabled (taskTickMs <= 0)");
    }
  }

  /**
   * Catch-up sweep AFTER every module finished init (the runners' registries are
   * rebuilt from disk by then): write any missed outcomes, then re-arm the queues —
   * a slot may have freed while the API was down, so drain every project's queue once.
   */
  onApplicationBootstrap(): void {
    void this.sweepOutcomes()
      .then(() => this.drainQueues())
      .then(() => this.recoverPending());
  }

  /**
   * Re-drive any task left `pending` by a restart. A `pending` task's dispatch runs in
   * the background ({@link dispatchPending}); if the API died inside that seconds-long
   * window the task is stranded on disk — never dispatched, never failed. Like the
   * queued-drain and the scheduled-tick recover their own waiting states, this re-runs
   * the classify+spawn so the work still executes (Law 5: a described task is never
   * silently dropped). The title is already persisted, so it dispatches as-is (no
   * re-titling); a pre-chosen `target` (a goal loop) rides along exactly as on create.
   */
  private async recoverPending(): Promise<void> {
    const tasks = await this.storage.list().catch((): ScheduledTask[] => []);
    for (const task of tasks) {
      if (task.status !== "pending") continue;
      const project = task.projectId
        ? await this.projects.get(task.projectId).catch((): Project | null => null)
        : null;
      this.log.info("recovering pending task stranded by restart", { id: task.id });
      void this.dispatchPending(task, project, task.target, false);
    }
  }

  onModuleDestroy(): void {
    this.stopTimer();
    for (const unsubscribe of this.unsubscribes) unsubscribe();
  }

  /**
   * Create a task. A future `scheduledAt` parks it (→ `scheduled`); otherwise it is
   * attributed, budget/concurrency-guarded and dispatched now. Over a cap the task is
   * persisted `held` (behind an approval); at capacity it is persisted `queued`; both
   * surface to the client as a parked task (`outcome: "scheduled"`). Throws
   * {@link EmptyCatalogError} when an immediate dispatch has nothing to route to.
   */
  /**
   * @param trustedProjectId set ONLY by server-side callers (the channel triage flow,
   * which already matched the engagement over sanitized text). It bypasses the
   * matcher; the public contract never accepts it from a client (Law 4 — attribution
   * is server-derived, never client-asserted).
   */
  async createTask(
    input: CreateTaskInput,
    now: number = Date.now(),
    trustedProjectId?: string,
    /**
     * Phase 10: a pre-chosen target that bypasses classification (an approved
     * proposed-task whose suggested target is a goal/agent/pipeline). The immediate
     * dispatch path routes straight to it; absent → classify as before.
     */
    explicitTarget?: TaskTarget,
    /**
     * When set (the interactive New Task dialog path), the heavy dispatch — Haiku
     * titling, classification and the run spawn — is deferred to the BACKGROUND: the
     * task is persisted `pending` and returned immediately so the dialog can redirect
     * to its run without waiting on the spawn. Synchronous server callers (chat,
     * channel triage, proposed-task) leave it `false`, keeping their existing
     * fail-fast (`EmptyCatalogError`/`runRef`) semantics intact.
     */
    background = false,
  ): Promise<CreateTaskResult> {
    // A task with no operator-given name gets one derived from its description (Haiku,
    // with a deterministic fallback) so the feed never shows an untitled task. The
    // background path can't block the submit on an 8s namer — it takes the instant
    // fallback now and refines via Haiku off the response path (see `refineTitle`).
    const titleAuto = !input.title?.trim();
    input = background ? this.withFallbackTitle(input) : await this.ensureTitle(input);
    // Task 6: resolve the referenced attachment set ONCE, up front — both the
    // scheduled path (`storage.create`) and the immediate path (`attemptCreate`)
    // persist the resolved metadata (not just the id), so a restart or a UI read
    // never has to re-list the set.
    const attachments: Attachment[] = input.attachmentSetId
      ? await this.attachmentStorage.list(input.attachmentSetId)
      : [];
    const resolvedInput: CreateTaskInputResolved = { ...input, attachments };
    // Phase 11: the unified composer carries a pre-chosen target on the wire (a
    // scheduled loop's goal). A server-side `explicitTarget` arg (proposed-task
    // resume) still wins when both are present.
    const rawTarget = explicitTarget ?? input.target;
    // Phase 91: an explicit subsystem target is resolved to a concrete pipeline
    // target HERE — before either persistence path below (scheduled or immediate)
    // — so a 0-owned rejection is a clean validation error, never a task record
    // that later fails on dispatch. See `resolveSubsystemTarget`.
    const target =
      rawTarget?.kind === "subsystem"
        ? await this.resolveSubsystemTarget(rawTarget, input.text, input.paths ?? [])
        : rawTarget;
    const project = trustedProjectId
      ? await this.projects.get(trustedProjectId).catch((): Project | null => null)
      : matchProject(await this.projects.list().catch((): Project[] => []), {
          text: input.text,
          paths: input.paths,
        });

    if (input.scheduledAt != null && input.scheduledAt > now) {
      const task = await this.storage.create(
        { ...resolvedInput, scheduledAt: input.scheduledAt },
        new Date(now).toISOString(),
        project?.id,
      );
      this.log.info("task scheduled", {
        id: task.id,
        scheduledAt: task.scheduledAt,
        projectId: project?.id,
      });
      void this.activity.record({
        kind: "task-created",
        summary: `task scheduled${task.title ? `: ${task.title}` : ""}`,
        refs: {
          taskId: task.id,
          status: "scheduled",
          ...(project ? { projectId: project.id } : {}),
        },
      });
      if (background && titleAuto) this.refineTitle(task.id, input.text);
      return { outcome: "scheduled", task };
    }

    // Generate the id BEFORE dispatch so the run is born linked to its task.
    const taskId = this.storage.newId();
    void this.activity.record({
      kind: "task-created",
      summary: `task created${input.title ? `: ${input.title}` : ""}`,
      refs: { taskId, ...(project ? { projectId: project.id } : {}) },
    });
    return this.attemptCreate(taskId, resolvedInput, project, now, target, background, titleAuto);
  }

  /**
   * Phase 91 / F2a — resolve a subsystem target to a concrete pipeline target
   * (the design doc's 0/1/N-owned-pipeline rule):
   *  - **0 owned** → `null` — no capability to delegate to.
   *  - **1 owned** → dispatches straight to it; the classifier is never called.
   *  - **2+ owned** → `TaskClassifierService.classifyWithinSubsystem`, restricted
   *    to just the owned pipelines (never the full catalog, never a fallback to
   *    the orchestrator — the operator, or the switchboard's stage-1 verdict,
   *    already named the subsystem).
   *
   * The resolved pipeline target IS the run's "via <subsystem>" attribution: any
   * consumer can already read `Pipeline.ownerSubsystem` (Phase 81) off the
   * dispatched pipeline id, so this adds no new run-level field.
   *
   * Two callers choose differently on `null` — see {@link resolveSubsystemTarget}
   * (the explicit `@mention` path, throws) and {@link dispatch} (the undirected
   * switchboard path, falls back to {@link ORCHESTRATOR_TARGET}).
   */
  private async resolveSubsystemTargetOrNull(
    target: Extract<TaskTarget, { kind: "subsystem" }>,
    text: string,
    paths: string[],
  ): Promise<TaskTarget | null> {
    const owned = (await this.pipelinesStore.list().catch((): Pipeline[] => [])).filter(
      (p) => p.ownerSubsystem === target.id,
    );
    if (owned.length === 0) return null;
    if (owned.length === 1) {
      return pipelineTaskTarget(owned[0]!);
    }
    const routing = await this.classifier.classifyWithinSubsystem(
      { text, paths },
      owned.map((p) => p.id),
    );
    // Defensive only: `classifyWithinSubsystem` returns null solely for an empty
    // candidate set, which `owned.length > 1` already rules out.
    return routing?.target ?? pipelineTaskTarget(owned[0]!);
  }

  /**
   * The EXPLICIT-target wrapper around {@link resolveSubsystemTargetOrNull}:
   * called once, up front, by {@link createTask} before any persistence, for an
   * `@`-mentioned subsystem target. A mandate without capability shouldn't
   * pretend to execute (deliberate v1 floor) — 0 owned pipelines rejects
   * immediately with {@link SubsystemEmptyRosterError}, a clear Czech validation
   * message, rather than silently falling back to the orchestrator.
   */
  private async resolveSubsystemTarget(
    target: Extract<TaskTarget, { kind: "subsystem" }>,
    text: string,
    paths: string[],
  ): Promise<TaskTarget> {
    const resolved = await this.resolveSubsystemTargetOrNull(target, text, paths);
    if (!resolved) throw new SubsystemEmptyRosterError(subsystemDisplayName(target.id));
    return resolved;
  }

  /**
   * Resolve a task's title: keep an operator-given one; otherwise derive it from the
   * description via the Haiku namer, falling back to a deterministic slice when the
   * namer is unavailable or rejects (it never blocks task creation).
   */
  private async ensureTitle(input: CreateTaskInput): Promise<CreateTaskInput> {
    if (input.title?.trim()) return input;
    const derived = (await this.namer.name(input.text)) ?? deriveTitleFallback(input.text);
    return { ...input, title: derived };
  }

  /**
   * Give a title-less input an INSTANT deterministic title — the background path's
   * stand-in until {@link refineTitle} swaps in the Haiku name. A provided title is
   * kept untouched.
   */
  private withFallbackTitle(input: CreateTaskInput): CreateTaskInput {
    if (input.title?.trim()) return input;
    return { ...input, title: deriveTitleFallback(input.text) };
  }

  /**
   * Refine a background task's fallback title via the Haiku namer, off the response
   * path, patching the record when the namer returns one. Never throws — a namer miss
   * (or the `VITEST` guard) leaves the deterministic fallback title in place.
   */
  private refineTitle(taskId: string, text: string): void {
    void (async () => {
      const derived = await this.namer.name(text).catch(() => null);
      if (derived) await this.storage.setTitle(taskId, derived).catch(() => {});
    })();
  }

  /** Cancel a still-waiting task. A held task's approval is rejected (single source of truth). */
  async cancel(id: string): Promise<ScheduledTask> {
    const task = await this.storage.get(id);
    if (task.status === "held" && task.approvalId) {
      // Route through approvals.reject → the kind-"task" runner cancels the task.
      await this.approvals.reject(task.approvalId).catch(() => {});
      return this.storage.get(id);
    }
    return this.storage.cancel(id);
  }

  /** Fire every scheduled task whose time has come; returns the fired ids. */
  async tick(now: Date = new Date()): Promise<string[]> {
    const fired: string[] = [];
    for (const task of await this.storage.list()) {
      if (task.status !== "scheduled") continue;
      if (task.scheduledAt > now.getTime()) continue;
      // Each fired task gets its own trace scope (no request to inherit one), so the
      // run it dispatches links back to this tick.
      await this.trace.run({ traceId: randomUUID() }, async () => {
        try {
          const project = task.projectId
            ? await this.projects.get(task.projectId).catch((): Project | null => null)
            : null;
          // Finding #1 (Task 3c fix): this call was bare — a scheduled task firing on
          // the heartbeat concurrently with a create/drain/release for the same
          // project raced the same check→record window findings #8/#9 are about. Same
          // lock, same fix — matches the `drainQueues` wrap shape.
          const result = await this.withCapacityLock(task.projectId, () =>
            this.attemptDispatch(task, project, now, { skipBudget: false }),
          );
          if (result === "dispatched") fired.push(task.id);
        } catch (err) {
          // M8: a THROWN dispatch error is transient (infra) — retry it with backoff
          // up to the cap, then dead-letter + notify. (A deterministic "no agents"
          // failure returns "failed" from attemptDispatch and never reaches here, so
          // it stays terminal — the right transient/permanent split, for free.)
          const message = err instanceof Error ? err.message : String(err);
          const attempt = (task.attempts ?? 0) + 1;
          if (attempt >= MAX_DISPATCH_ATTEMPTS) {
            await this.storage.markDeadLettered(task.id, message);
            void this.activity.record({
              kind: "task-dead-lettered",
              summary: `task "${(task.title ?? task.text).slice(0, 80)}" dead-lettered after ${attempt} attempts: ${message}`,
              refs: { taskId: task.id, status: "dead-letter" },
            });
            this.log.error("scheduled task dead-lettered", {
              id: task.id,
              attempts: attempt,
              error: message,
            });
          } else {
            const nextAt = now.getTime() + DISPATCH_BACKOFF_MS * 2 ** (attempt - 1);
            await this.storage.markRetry(task.id, nextAt, message);
            this.log.warn("scheduled task dispatch failed — retrying", {
              id: task.id,
              attempt,
              nextAt,
              error: message,
            });
          }
        }
      });
    }
    void this.sweepOrphanAttachmentSets(now.getTime());
    return fired;
  }

  /**
   * Task 9: best-effort cleanup of attachment-set dirs no persisted task references,
   * once they're past the TTL. Never throws — every I/O step is guarded — so it's safe
   * to fire-and-forget from {@link tick}. Returns the count removed (tests only).
   *
   * Phase 116b: also asks every registered {@link AttachmentSetRefProvider} — a
   * `task`-target automation references a set without ever persisting a
   * `ScheduledTask` until it fires, so its set would otherwise age out between cron
   * runs. A provider that throws is skipped (best-effort, never blocks the sweep).
   */
  async sweepOrphanAttachmentSets(now: number): Promise<number> {
    const tasks = await this.storage.list().catch(() => []);
    const referenced = new Set(
      tasks.map((t) => t.attachmentSetId).filter((id): id is string => Boolean(id)),
    );
    for (const provider of this.attachmentRefProviders) {
      const ids = await provider.referencedSetIds().catch(() => []);
      for (const id of ids) referenced.add(id);
    }
    const sets = await this.attachmentStorage.listSetIds().catch(() => []);
    let removed = 0;
    for (const s of sets) {
      if (referenced.has(s.id)) continue;
      if (now - s.mtimeMs < ATTACHMENT_TTL_MS) continue;
      await this.attachmentStorage
        .remove(s.id)
        .then(() => {
          removed += 1;
        })
        .catch(() => {});
    }
    return removed;
  }

  /**
   * Run `fn` exclusively for `projectId` (findings #8/#9 — the maxConcurrent TOCTOU
   * and the budget check→record race live in the same code region: `budget.check` →
   * `atCapacity` → the real `dispatch` → `recordLedger`, unserialized, let two
   * concurrent creates for the same project both pass the gate and both dispatch,
   * exceeding `maxConcurrent` and over-recording the ledger past its cap — a Law-3
   * violation). `project-capacity:${projectId}` is a NEW key, disjoint from the
   * `task:${id}` outcome-writer lock and the global `scheduler:drain` sweep lock. An
   * unscoped task (no `projectId`) never contends on either race, so it runs
   * unlocked — matching `atCapacity`'s own short-circuit for `project == null`.
   *
   * Every real spend path for a project is guarded by this SAME key (Task 3c fix —
   * the set is now complete):
   *  - `attemptCreate`'s synchronous branch ({@link attemptCreateSync}) — one
   *    acquisition covers guard+dispatch+record.
   *  - `attemptCreate`'s background branch — the create-time gate
   *    ({@link guardCapacity}) is its own (fast) acquisition; the real dispatch is
   *    {@link dispatchPending}'s self-wrap (below), a second, fresh acquisition.
   *  - `tick` — each fired scheduled task's {@link attemptDispatch} call.
   *  - `drainQueues` — each queued task's {@link attemptDispatch} call, nested inside
   *    the global `scheduler:drain` sweep lock (different key, ordinary nesting).
   *  - `releaseHeld` — the operator-triggered release's {@link attemptDispatch} call.
   *  - `recoverPending` (the boot-recovery sweep) — covered "for free" via
   *    {@link dispatchPending}'s self-wrap; every `void this.dispatchPending(...)`
   *    call site (there are exactly two: `attemptCreate`'s background branch and
   *    `recoverPending`) is a fresh acquisition per the file-lock.ts CONTRACT — never
   *    called from inside an already-held section for the same key.
   */
  private withCapacityLock<T>(projectId: string | undefined, fn: () => Promise<T>): Promise<T> {
    return projectId ? withPathLock(`project-capacity:${projectId}`, fn) : fn();
  }

  /**
   * The shared budget+capacity guard: over budget → hold behind approval; at
   * capacity → queue. Both persist + surface as `outcome: "scheduled"`. Returns
   * `{ ok: true }` to let the caller proceed to an actual dispatch. Callers run this
   * INSIDE {@link withCapacityLock} — see {@link attemptCreate}.
   */
  private async guardCapacity(
    taskId: string,
    input: CreateTaskInputResolved,
    project: Project | null,
    projectId: string | undefined,
    now: number,
  ): Promise<{ ok: true } | { ok: false; result: CreateTaskResult }> {
    const check = await this.budget.check(projectId, new Date(now));
    if (!check.ok) {
      const task = await this.storage.createHeld(taskId, input, projectId, check.detail, now);
      const held = await this.holdForApproval(task, project, check.detail, check.metrics);
      return { ok: false, result: { outcome: "scheduled", task: held } };
    }
    if (await this.atCapacity(project)) {
      const task = await this.storage.createQueued(taskId, input, projectId, now);
      this.recordQueued(task, project);
      return { ok: false, result: { outcome: "scheduled", task } };
    }
    return { ok: true };
  }

  /**
   * The immediate-create guard: attribute, budget-check, then either hold, queue, or
   * dispatch — returning the client-facing {@link CreateTaskResult}. A held/queued
   * task surfaces as `outcome: "scheduled"` (a parked task the feed renders by status).
   *
   * Findings #8 (High, maxConcurrent TOCTOU) / #9 (Critical, budget check→record
   * race): the synchronous branch runs its ENTIRE guard+dispatch as one normal
   * `await`ed call under `project-capacity:${projectId}` ({@link attemptCreateSync}) —
   * simple, since this branch already blocks the HTTP response on the dispatch, so
   * serializing it fully against siblings adds no NEW latency cost.
   *
   * The background branch (the interactive New Task dialog path — "the gap that
   * matters", per the audit) can't do the same: the create-time gate must stay FAST
   * (a sibling create's own gate check must not block behind THIS task's real
   * dispatch — the classify+Haiku+spawn chain the whole `background` path exists to
   * get off the response path). So the gate and the real dispatch run as TWO
   * separate `project-capacity` acquisitions:
   *  1. The gate ({@link guardCapacity}) — held/queued still returns fast, exactly as
   *     before. A pass persists the task `pending` and returns immediately.
   *  2. `dispatchPending`, kicked off as a bare `void this.dispatchPending(...)` from
   *     THIS (unlocked) continuation. {@link dispatchPending} SELF-WRAPS its own
   *     critical section in `project-capacity` — a genuinely fresh acquisition, per
   *     the file-lock.ts CONTRACT (a call made from INSIDE an already-held section
   *     would capture the ambient held-set and, once it tried to acquire the SAME key
   *     after that holder released, would see it as still held and run inline,
   *     unprotected — silently breaking mutual exclusion). This shape (rather than
   *     wrapping the call HERE) also lets `dispatchPending` title the task — a
   *     documented ~8s Haiku call — BEFORE taking the lock (Task 3c fix, finding #3):
   *     titling is capacity-independent, so holding the concurrency slot across that
   *     network call would serialize concurrent same-project titling for nothing.
   *     `recoverPending`'s own `void this.dispatchPending(...)` (the boot-recovery
   *     path) rides the exact same self-wrap "for free" (Task 3c fix, finding #2).
   *
   * Between (1) and (2) a sibling create can race in and ALSO pass its own gate
   * check (neither has dispatched yet, so `atCapacity`/`budget.check` both still read
   * "under cap"). `dispatchPending` closes this gap itself: it re-verifies budget +
   * capacity ({@link guardExisting}) immediately before the real dispatch, now
   * properly serialized (same lock, FIFO) against every other real dispatch for the
   * project — a task that loses this recheck flips `pending → held/queued` instead
   * of also dispatching.
   */
  private async attemptCreate(
    taskId: string,
    input: CreateTaskInputResolved,
    project: Project | null,
    now: number,
    explicitTarget?: TaskTarget,
    /** Defer the classify+spawn to {@link dispatchPending} (the interactive path). */
    background = false,
    /** The title was auto-derived (refine it via Haiku off the response path). */
    titleAuto = false,
  ): Promise<CreateTaskResult> {
    const projectId = project?.id;
    // Phase 9: the limit guard runs FIRST (decision 4) — an exhausted usage window
    // means nothing can run, so deferring to the window reset is the right shape
    // (not holding for approval or queueing). Fail-open: a stale/headroom reading
    // falls through to the budget + concurrency guards exactly as before. Not part
    // of the capacity/budget race (a limit deferral never dispatches), so it stays
    // outside `project-capacity`.
    const deferral = await this.limitDeferral(now);
    if (deferral) {
      const task = await this.storage.createDeferredLimit(
        taskId,
        input,
        projectId,
        deferral.resumeAt,
        now,
      );
      this.recordDeferredLimit(task);
      if (background && titleAuto) this.refineTitle(task.id, input.text);
      return { outcome: "scheduled", task };
    }

    if (!background) {
      return this.withCapacityLock(projectId, () =>
        this.attemptCreateSync(taskId, input, project, projectId, now, explicitTarget),
      );
    }

    const gate = await this.withCapacityLock(projectId, () =>
      this.guardCapacity(taskId, input, project, projectId, now),
    );
    if (!gate.ok) {
      if (titleAuto) this.refineTitle(gate.result.task.id, input.text);
      return gate.result;
    }
    // The interactive path returns here without blocking on the spawn: persist the
    // task `pending` and run classify+spawn in the background (→ `dispatched`/`failed`/
    // `held`/`queued` — see the CONTRACT note above for why this is a FRESH lock call).
    const task = await this.storage.createPending(taskId, input, projectId, now, explicitTarget);
    // NOT wrapped here — `dispatchPending` self-wraps its own critical section (see
    // this method's doc comment, and `dispatchPending`'s own). This is still a FRESH
    // acquisition per the file-lock.ts CONTRACT: the gate's lock (above) has already
    // resolved and released by the time this line runs.
    void this.dispatchPending(task, project, explicitTarget, titleAuto);
    return { outcome: "pending", task };
  }

  /** The synchronous-branch body of {@link attemptCreate}, run inside `project-capacity`. */
  private async attemptCreateSync(
    taskId: string,
    input: CreateTaskInputResolved,
    project: Project | null,
    projectId: string | undefined,
    now: number,
    explicitTarget: TaskTarget | undefined,
  ): Promise<CreateTaskResult> {
    const gate = await this.guardCapacity(taskId, input, project, projectId, now);
    if (!gate.ok) return gate.result;
    const dispatched = await this.dispatch(
      input.text,
      input.paths ?? [],
      input.title ?? "",
      taskId,
      projectId,
      explicitTarget,
      input.output,
      input.attachmentSetId,
      input.attachments,
      input.toolGrants,
    );
    if (!dispatched) throw new EmptyCatalogError();
    const task = await this.persistDispatched(taskId, input, dispatched, projectId, now);
    void this.reconcileOutcome(task);
    return { outcome: "dispatched", runRef: dispatched.runRef, target: dispatched.target, task };
  }

  /**
   * The background dispatch behind a `pending` task — the interactive create path
   * (a fresh lock acquisition, per {@link attemptCreate}'s doc comment) AND the boot
   * recovery path ({@link recoverPending}, also a fresh, unlocked call site). In its
   * own trace scope: refine the fallback title (Haiku, off the response path) so the
   * run and task record share it, then classify + spawn exactly like the synchronous
   * path. Success flips the task `pending → dispatched`; an empty catalog or any
   * thrown error flips it `pending → failed` with a visible reason and a
   * `task-outcome` activity — a described task never silently no-ops (Law 5).
   *
   * Task 3c fix (findings #2/#3): SELF-WRAPS the critical section
   * (`guardExisting → dispatch → recordLedger/markDispatched`) in
   * `project-capacity:${projectId}` rather than relying on the caller to wrap the
   * whole call — this covers `recoverPending`'s unguarded loop "for free" (finding
   * #2) AND lets titling (`namer.name`, a documented ~8s LLM call) run BEFORE the
   * lock is taken (finding #3): titling is capacity-independent, so holding the
   * concurrency slot across that network call would only serialize concurrent
   * same-project titling for no reason — exactly the latency regression the
   * `background` design exists to avoid.
   */
  private dispatchPending(
    task: ScheduledTask,
    project: Project | null,
    explicitTarget: TaskTarget | undefined,
    titleAuto: boolean,
  ): Promise<void> {
    return this.trace.run({ traceId: randomUUID() }, async () => {
      const projectId = project?.id;
      try {
        // Titling is capacity-independent — do it BEFORE taking the lock (finding #3).
        let title = task.title;
        if (titleAuto) {
          const derived = await this.namer.name(task.text).catch(() => null);
          if (derived) {
            title = derived;
            await this.storage.setTitle(task.id, derived).catch(() => {});
          }
        }
        await this.withCapacityLock(task.projectId, async () => {
          // Findings #8/#9: re-verify budget + capacity HERE, immediately before the
          // real dispatch — see attemptCreate's doc comment for why this recheck
          // (rather than just serializing) is what actually closes the gap. A
          // sibling create that raced past the create-time gate but loses this
          // recheck flips `pending → held/queued` instead of also dispatching.
          const guard = await this.guardExisting(task, project, new Date(), false);
          if (guard !== "ok") return;
          const dispatched = await this.dispatch(
            task.text,
            task.paths,
            title,
            task.id,
            projectId,
            explicitTarget,
            task.output,
            task.attachmentSetId,
            task.attachments,
            task.toolGrants,
          );
          if (!dispatched) {
            await this.failPending(
              task.id,
              projectId,
              "No agents or pipelines available to route to",
            );
            return;
          }
          await this.recordLedger(task.id, projectId, dispatched);
          const updated = await this.storage.markDispatched(
            task.id,
            dispatched.runRef,
            dispatched.target,
          );
          this.recordDispatchedActivity(task.id, projectId, dispatched);
          this.log.info("task dispatched (background)", {
            id: task.id,
            runRef: dispatched.runRef,
            projectId,
          });
          void this.reconcileOutcome(updated);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.failPending(task.id, projectId, message);
        this.log.error("background task dispatch failed", { id: task.id, error: message });
      }
    });
  }

  /** Flip a pending task to `failed` with a visible reason + activity (never silent). */
  private async failPending(
    taskId: string,
    projectId: string | undefined,
    reason: string,
  ): Promise<void> {
    await this.storage.markFailed(taskId, reason).catch(() => {});
    void this.activity.record({
      kind: "task-outcome",
      summary: `task dispatch failed: ${reason}`,
      refs: { taskId, status: "error", ...(projectId ? { projectId } : {}) },
    });
  }

  /**
   * Budget+capacity guard for an ALREADY-PERSISTED task — marks it held/queued IN
   * PLACE (`storage.markHeld`/`markQueued`) rather than creating a new held/queued
   * record ({@link guardCapacity} does that, for a task not yet persisted). Shared by
   * {@link attemptDispatch} (the tick/drain/release paths) and `dispatchPending`'s
   * pre-dispatch recheck (findings #8/#9 — see {@link attemptCreate}'s doc comment).
   */
  private async guardExisting(
    task: ScheduledTask,
    project: Project | null,
    at: Date,
    skipBudget: boolean,
  ): Promise<"ok" | "held" | "queued"> {
    if (!skipBudget) {
      const check = await this.budget.check(task.projectId, at);
      if (!check.ok) {
        await this.storage.markHeld(task.id, check.detail);
        await this.holdForApproval(task, project, check.detail, check.metrics);
        return "held";
      }
    }
    if (await this.atCapacity(project)) {
      await this.storage.markQueued(task.id);
      this.recordQueued(task, project);
      return "queued";
    }
    return "ok";
  }

  /**
   * The guard for an EXISTING task record (the tick fire path, the queue drain, and
   * the release path). Returns the resulting state. `skipBudget` is the release-once
   * bypass — an operator-approved overage skips the budget check but still honors
   * concurrency. Records the budget ledger line on every actual dispatch.
   */
  private async attemptDispatch(
    task: ScheduledTask,
    project: Project | null,
    now: number | Date,
    opts: { skipBudget: boolean },
  ): Promise<"dispatched" | "queued" | "held" | "failed" | "deferred"> {
    const at = typeof now === "number" ? new Date(now) : now;
    // Phase 9: limit guard first — even an operator-approved overage (`skipBudget`)
    // can't run with the window exhausted, so re-defer to the reset. The existing
    // tick re-fires the now-`scheduled` task; still exhausted → re-defer again.
    const deferral = await this.limitDeferral(at.getTime());
    if (deferral) {
      const deferred = await this.storage.markDeferredLimit(task.id, deferral.resumeAt);
      this.recordDeferredLimit(deferred);
      return "deferred";
    }
    const guard = await this.guardExisting(task, project, at, opts.skipBudget);
    if (guard !== "ok") return guard;
    // Phase 10: a task that already carries a target (e.g. a goal, never classifiable)
    // re-dispatches to it; otherwise classify as before.
    const dispatched = await this.dispatch(
      task.text,
      task.paths,
      task.title,
      task.id,
      task.projectId,
      task.target,
      task.output,
      task.attachmentSetId,
      task.attachments,
      task.toolGrants,
    );
    if (!dispatched) {
      await this.storage.markFailed(task.id, "No agents or pipelines available to route to");
      this.log.warn("task failed: empty catalog", { id: task.id });
      return "failed";
    }
    await this.recordLedger(task.id, task.projectId, dispatched);
    const updated = await this.storage.markDispatched(
      task.id,
      dispatched.runRef,
      dispatched.target,
    );
    this.budgetApproved.delete(task.id);
    void this.reconcileOutcome(updated);
    this.recordDispatchedActivity(task.id, task.projectId, dispatched);
    this.log.info("task dispatched", {
      id: task.id,
      runRef: dispatched.runRef,
      projectId: task.projectId,
    });
    return "dispatched";
  }

  /**
   * True when the project caps concurrency and is already at its `maxConcurrent`.
   * Phase 70: reads the EFFECTIVE (company-merged) budget via `ResolvedProjectService`,
   * not the raw `project.budget` — a company-set `maxConcurrent` now caps every linked
   * project's concurrency too, unless the project overrides it itself. A company-less
   * project (or a dangling `companyId`) resolves to its own raw budget, unchanged.
   */
  private async atCapacity(project: Project | null): Promise<boolean> {
    if (project == null) return false;
    const max = (await this.resolved.resolveBudget(project))?.maxConcurrent;
    if (max == null) return false;
    return (await this.budget.countRunning(project.id)) >= max;
  }

  /** Park a held task behind a `spend-past-cap` approval; returns the stamped task. */
  private async holdForApproval(
    task: ScheduledTask,
    project: Project | null,
    detail: string,
    /** Phase 12: the dollar facts on a cost-cap hold ({ costUsd, capUsd }); absent on a run-count hold. */
    metrics?: BudgetOverMetrics,
  ): Promise<ScheduledTask> {
    // Evaluate the floor so a `gate-decision` is recorded (the approval IS the gate).
    // Phase 12: a dollar-cap hold rides its costUsd/capUsd as metrics so a `threshold`
    // floor rule can read them (IntendedActionSchema.metrics already supported this).
    this.gates.evaluate(await this.gates.floor(), {
      action: SPEND_PAST_CAP,
      ...(metrics ? { metrics } : {}),
    });
    const approval = await this.approvals.requestApproval({
      runId: task.id,
      kind: "task",
      skill: project?.name ?? "global",
      action: SPEND_PAST_CAP,
      detail,
      risk: "medium",
    });
    const stamped = await this.storage.setApproval(task.id, approval.id);
    void this.activity.record({
      kind: "task-held",
      summary: `task held — ${detail}`,
      refs: {
        taskId: task.id,
        approvalId: approval.id,
        ...(task.projectId ? { projectId: task.projectId } : {}),
      },
    });
    this.log.info("task held over budget", { id: task.id, approvalId: approval.id, detail });
    return stamped;
  }

  /** The kind-"task" approval resume: dispatch a held task once, past the cap. */
  private async releaseHeld(taskId: string): Promise<void> {
    let task: ScheduledTask;
    try {
      task = await this.storage.get(taskId);
    } catch {
      this.log.warn("release skipped: task gone", { taskId });
      return;
    }
    if (task.status !== "held") {
      this.log.info("release skipped: task no longer held", { taskId, status: task.status });
      return;
    }
    // Mark the overage approved so a wait-for-slot re-queue won't re-hold it.
    this.budgetApproved.add(taskId);
    const project = task.projectId
      ? await this.projects.get(task.projectId).catch((): Project | null => null)
      : null;
    // Finding #8 (A.2): this call was bare — an operator release racing a concurrent
    // `drainQueues`/`attemptCreate` for the same project is the same TOCTOU shape as
    // the cited line, just operator-triggered instead of automatic. Same lock, same
    // fix.
    await this.withCapacityLock(task.projectId, () =>
      this.attemptDispatch(task, project, Date.now(), { skipBudget: true }),
    );
  }

  /**
   * Drain every project's concurrency queue: for each project with queued tasks,
   * dispatch the oldest first while a slot is free. A normal queued task re-runs the
   * full guard (budget first — it can become held if the budget filled meanwhile); a
   * released (budget-approved) task skips only the budget check.
   */
  private drainQueues(): Promise<void> {
    // Serialize all drains: many terminal events fire near-simultaneously, and two
    // overlapping drains would both read the same task as `queued` and dispatch it
    // twice (a TOCTOU double-dispatch). The lock makes each drain see the prior
    // drain's markDispatched, so a queued task is dispatched exactly once.
    return withPathLock("scheduler:drain", async () => {
      const queued = (await this.storage.list().catch((): ScheduledTask[] => []))
        .filter((t) => t.status === "queued" && t.projectId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // FIFO
      if (queued.length === 0) return;
      const byProject = new Map<string, ScheduledTask[]>();
      for (const task of queued) {
        const list = byProject.get(task.projectId as string) ?? [];
        list.push(task);
        byProject.set(task.projectId as string, list);
      }
      for (const [projectId, list] of byProject) {
        const project = await this.projects.get(projectId).catch((): Project | null => null);
        for (const task of list) {
          if (await this.atCapacity(project)) break; // no slot free for this project
          // Re-read: a concurrent cancel may have moved it on already.
          const fresh = await this.storage.get(task.id).catch((): ScheduledTask | null => null);
          if (!fresh || fresh.status !== "queued") continue;
          // Finding #8 (A.2): nest the per-project `project-capacity` lock inside the
          // global `scheduler:drain` sweep lock — different keys, ordinary nesting —
          // so a drain's dispatch is serialized against a concurrent `attemptCreate`
          // or `releaseHeld` for the same project, not just against other drains.
          await this.trace.run({ traceId: randomUUID() }, () =>
            this.withCapacityLock(projectId, () =>
              this.attemptDispatch(fresh, project, Date.now(), {
                skipBudget: this.budgetApproved.has(fresh.id),
              }),
            ),
          );
        }
      }
    });
  }

  /**
   * Classify the text and start the routed run, threading the resolved `projectId`
   * into the runner so the run carries its engagement. Returns the started run's ref
   * and the chosen target, or null when the catalog is empty (nothing to route to).
   */
  private async dispatch(
    text: string,
    paths: string[],
    title: string,
    taskId: string,
    projectId: string | undefined,
    /**
     * Phase 10: a pre-chosen target that BYPASSES classification — a goal is never
     * auto-classified, so a goal-targeted task (the goals contract / an approved
     * proposed-task) carries its target explicitly. Absent → classify as before.
     */
    explicitTarget?: TaskTarget,
    /**
     * The task's chosen terminal output. Threaded into a pipeline route here (it
     * overrides the pipeline's declared `outputs:` for this run). For an
     * agent/orchestrator route the gate fires post-run from the task record, so it is
     * not needed at dispatch.
     */
    output?: TaskOutput,
    /**
     * Task 8: the task's persisted attachment set id + resolved metadata (Task 6).
     * When present, an absolute reference dir + the filenames are threaded into the
     * agent/orchestrator/goal runner (Task 7's `--add-dir` grant). Absent → no
     * attachments (every pre-attachments caller is unaffected).
     */
    attachmentSetId?: string,
    attachments?: Attachment[],
    /**
     * Phase 108: the operator's CONFIRMED tool-grant set (`CreateTaskInput.toolGrants`
     * / the persisted `ScheduledTask.toolGrants`, threaded the same way `paths`/`output`
     * already travel). Scoped to the agent runner only — the target's `optionalTools`
     * ceiling is the agent-definition field, so only an agent target has anything to
     * intersect against. Re-intersected against `target.optionalTools` INSIDE the
     * runner (never trusted blindly — see `AgentRunnerService.launch`).
     */
    toolGrants?: string[],
  ): Promise<{ runRef: string; target: TaskTarget } | null> {
    // Build the run-attachments reference ONCE: an absolute dir (from storage) plus
    // the filenames, or undefined when the task carries no attachment set.
    const runAttachments: RunAttachments | undefined = attachmentSetId
      ? {
          dir: this.attachmentStorage.dir(attachmentSetId),
          names: (attachments ?? []).map((a) => a.name),
        }
      : undefined;
    let target: TaskTarget;
    let matchedTerms: string[];
    if (explicitTarget) {
      target = explicitTarget;
      matchedTerms = [];
    } else {
      const routing = await this.classifier.classify({ text, paths });
      if (!routing) return null;
      target = routing.target;
      // The classifier's matched terms ride into the run so memory grounding selects
      // the same MOCs the routing keyed on (Phase 4).
      matchedTerms = routing.matchedTerms;
      // F2a — the switchboard may now emit a whole-subsystem verdict (never the
      // explicit `@mention` path above, which is already resolved by `createTask`
      // before `dispatch` is ever called). Soft stage-2: resolve to a concrete
      // pipeline, or — an empty roster — fall through to the orchestrator exactly
      // like any other "nothing matched confidently" verdict (the terminal block
      // below, unchanged, already records `orchestrator-fallback` for a
      // non-explicit target and starts the orchestrator).
      if (target.kind === "subsystem") {
        target =
          (await this.resolveSubsystemTargetOrNull(target, text, paths)) ?? ORCHESTRATOR_TARGET;
      }
    }
    if (target.kind === "agent") {
      const run = await this.agentRunner.start(
        target.id,
        text,
        projectId ?? "",
        paths,
        title,
        taskId,
        matchedTerms,
        undefined,
        runAttachments,
        toolGrants,
      );
      return { runRef: run.runId, target };
    }
    if (target.kind === "pipeline") {
      // Task 8: attachments are intentionally NOT passed to a pipeline target in v1 —
      // the pipeline runner has no attachments seam yet (documented deferred gap).
      const run = await this.pipelineRunner.start(
        target.id,
        taskId,
        projectId,
        matchedTerms,
        undefined,
        output,
      );
      return { runRef: run.pipelineRunId, target };
    }
    if (target.kind === "goal") {
      // Phase 10: route a goal-targeted task through the outer-loop runner. It flows
      // the projectId/taskId through so the goal counts toward concurrency + writes
      // its outcome back exactly like any other dispatched run.
      const run = await this.goalRunner.start(
        target.id,
        text,
        projectId ?? "",
        paths,
        title,
        taskId,
        matchedTerms,
        runAttachments,
      );
      return { runRef: run.goalRunId, target };
    }
    if (target.kind === "chain") {
      // Phase 05: a chain-targeted task dispatches through the chain runner. The
      // chain run carries the taskId so its terminal outcome writes back onto the
      // task exactly like agent/pipeline/goal runs.
      const run = await this.chainRunner.start(target.id, taskId);
      return { runRef: run.chainRunId, target };
    }
    // Phase 4a (Agent Factory telemetry): record a fallback ONLY when the
    // classifier itself picked the orchestrator (its terminal "nothing matched
    // confidently" rule) — an explicit `orchestrator` target (a directed override,
    // e.g. an approved proposed-task) is a deliberate choice, not an escape, and
    // must not count toward the Agent Factory's recurrence tally.
    if (!explicitTarget) {
      const normalizedSummary = normalizeSummary(text);
      void this.activity.record({
        kind: "orchestrator-fallback",
        summary: `orchestrator fallback: ${text.length > SUMMARY_MAX_CHARS ? `${text.slice(0, SUMMARY_MAX_CHARS)}…` : text}`,
        refs: { normalizedSummary, terms: matchedTerms.join(",") },
      });
    }
    // Terminal fallback: the orchestrator session self-delegates to the right
    // subagent(s) or does the task directly — a task never no-ops. It carries the
    // projectId too so an orchestrator-dispatched task counts toward concurrency.
    const run = await this.agentRunner.startOrchestrator(
      text,
      paths,
      title,
      taskId,
      matchedTerms,
      projectId ?? "",
      runAttachments,
    );
    return { runRef: run.runId, target };
  }

  /** Persist an immediately-dispatched task + its activity (the create path). */
  private async persistDispatched(
    taskId: string,
    input: CreateTaskInputResolved,
    dispatched: { runRef: string; target: TaskTarget },
    projectId: string | undefined,
    now: number,
  ): Promise<ScheduledTask> {
    await this.recordLedger(taskId, projectId, dispatched, now);
    const task = await this.storage.createDispatched(
      taskId,
      input,
      dispatched.runRef,
      dispatched.target,
      now,
      projectId,
    );
    this.recordDispatchedActivity(taskId, projectId, dispatched);
    return task;
  }

  /** Append the enforcement ledger line for a started run (awaited). */
  private recordLedger(
    taskId: string,
    projectId: string | undefined,
    dispatched: { runRef: string; target: TaskTarget },
    now: number = Date.now(),
  ): Promise<void> {
    return this.budget.recordDispatch(
      {
        at: new Date(now).toISOString(),
        ...(projectId ? { projectId } : {}),
        taskId,
        runRef: dispatched.runRef,
        kind: dispatched.target.kind,
      },
      new Date(now),
    );
  }

  private recordDispatchedActivity(
    taskId: string,
    projectId: string | undefined,
    dispatched: { runRef: string; target: TaskTarget },
  ): void {
    void this.activity.record({
      kind: "task-dispatched",
      summary: `dispatched to ${dispatched.target.kind} ${targetIdOf(dispatched.target)}`,
      refs: {
        taskId,
        runRef: dispatched.runRef,
        status: dispatched.target.kind,
        ...(projectId ? { projectId } : {}),
        ...refForTarget(dispatched.target),
      },
    });
  }

  private recordQueued(task: ScheduledTask, project: Project | null): void {
    void this.activity.record({
      kind: "task-queued",
      summary: `task queued — waiting for a slot${project ? ` in ${project.name}` : ""}`,
      refs: { taskId: task.id, ...(task.projectId ? { projectId: task.projectId } : {}) },
    });
    this.log.info("task queued", { id: task.id, projectId: task.projectId });
  }

  /**
   * Phase 9 limit guard: when is the usage window exhausted enough to defer a
   * dispatch? Returns the resume epoch (the reset, or a conservative fallback) when
   * over-limit, else null. Fail-open — {@link LimitsService.windowExhausted} returns
   * `false` on a stale/unreadable snapshot, so deferring never blocks all work on a
   * lagging capture file (decision 5).
   */
  private async limitDeferral(now: number): Promise<{ resumeAt: number } | null> {
    const { exhausted, resumeAt } = await this.limits.windowExhausted().catch(() => ({
      exhausted: false,
      resumeAt: null,
    }));
    if (!exhausted) return null;
    return { resumeAt: resumeAt ?? (await this.limits.resolveResumeAt(null, now)) };
  }

  /** Record a window-deferred task (Tier 1 — silent, recorded; the briefing reads it). */
  private recordDeferredLimit(task: ScheduledTask): void {
    void this.activity.record({
      kind: "task-deferred-limit",
      summary: "task deferred — waiting for the usage window to reset",
      refs: {
        taskId: task.id,
        status: "scheduled",
        ...(task.projectId ? { projectId: task.projectId } : {}),
      },
    });
    this.log.info("task deferred on usage limit", {
      id: task.id,
      scheduledAt: task.scheduledAt,
      deferrals: task.limitDeferrals,
    });
  }

  /** Sweep every dispatched-without-outcome task against its runner once. */
  private async sweepOutcomes(): Promise<void> {
    const tasks = await this.storage.list().catch((): ScheduledTask[] => []);
    for (const task of tasks) {
      if (task.status !== "dispatched" || task.outcome || !task.runRef) continue;
      await this.reconcileOutcome(task);
    }
  }

  /** Resolve one task's run; if it already ended, write the outcome now. */
  private async reconcileOutcome(task: ScheduledTask): Promise<void> {
    if (!task.runRef || task.outcome) return;
    try {
      if (task.target?.kind === "pipeline") {
        await this.writePipelineOutcome(task.id, this.pipelineRunner.get(task.runRef));
      } else if (task.target?.kind === "goal") {
        await this.writeGoalOutcome(task.id, this.goalRunner.get(task.runRef));
      } else {
        await this.writeAgentOutcome(task.id, this.agentRunner.get(task.runRef));
      }
    } catch {
      // Run unknown (deleted / different machine) — leave the task without outcome.
    }
  }

  private async writeAgentOutcome(taskId: string, run: AgentRun): Promise<void> {
    if (run.status !== "done" && run.status !== "error" && run.status !== "interrupted") return;
    // Finding #7 (Critical): the `onRunStatus` fast path and `reconcileOutcome`/
    // `sweepOutcomes` can both reach this method for the same task before either has
    // written an outcome. Without serialization, both pass the guard read below and
    // both call `handleTerminal`, which opens a PR unconditionally — a double-PR side
    // effect. One lock per call, keyed on the task — NOT hoisted around the sweep
    // loop in `sweepOutcomes` (that would serialize unrelated tasks against each
    // other for no reason).
    await withPathLock(`task:${taskId}`, async () => {
      try {
        const existing = await this.storage.get(taskId);
        // Already resolved, or parked at the PR output gate (the gate writes the outcome
        // on the operator's decision) — don't re-process / re-park.
        if (existing.outcome || existing.status === "awaiting-output") return;
        const summary = await this.agentRunSummary(run.runId);
        // A successful run with a chosen `pr`/`file` output runs its terminal sink first.
        // A `pr` sink opens the PR immediately (Tier-2, no gate) and hands back the PR
        // note + structured result to fold into the outcome we write here.
        let outcomeSummary = summary;
        let pr: TaskOutcome["pr"];
        if (run.status === "done") {
          const delivery = await this.taskOutput.handleTerminal(existing, run, summary);
          if (delivery?.summary) outcomeSummary = delivery.summary;
          if (delivery?.pr) pr = delivery.pr;
        }
        const status = run.status === "done" ? "done" : "error";
        const task = await this.storage.writeOutcome(taskId, {
          status,
          summary: outcomeSummary,
          finishedAt: new Date().toISOString(),
          ...(pr ? { pr } : {}),
        });
        this.log.info("task outcome written", { taskId, runRef: run.runId, status: run.status });
        void this.activity.record({
          kind: "task-outcome",
          summary: `task ${status}${outcomeSummary ? `: ${outcomeSummary}` : ""}`,
          refs: {
            taskId,
            runRef: run.runId,
            status,
            ...(task.projectId ? { projectId: task.projectId } : {}),
          },
        });
        await this.recordRunCost(task.projectId, taskId, run.runId, "agent", run.costUsd);
      } catch (error) {
        // Task record gone or not yet persisted — the reconcile/sweep paths cover it.
        this.log.debug("task outcome write skipped", {
          taskId,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  private async writePipelineOutcome(taskId: string, run: PipelineRun): Promise<void> {
    if (run.status !== "done" && run.status !== "failed") return;
    const outcome: TaskOutcome = {
      status: run.status === "done" ? "done" : "error",
      // A `pr` output opened a PR (Tier-2, no gate) → surface the url as the summary and
      // carry the structured result so the run detail renders the link + line totals.
      summary: run.prOutput
        ? `PR otevřen: ${run.prOutput.url}`
        : `${run.stageRuns.length} stages, ${run.status}`,
      finishedAt: new Date().toISOString(),
      ...(run.prOutput ? { pr: run.prOutput } : {}),
    };
    // Finding #7: same `onRunStatus`-fast-path-vs-`reconcileOutcome` race as
    // `writeAgentOutcome` — see the lock comment there. This writer doesn't open a PR
    // itself (the pipeline runner already did, before this method ever runs), so the
    // race here is lower-harm (a duplicate activity line / lost-update on which run's
    // summary wins), but all four `writeXOutcome` writers lock the same way for
    // consistency.
    await withPathLock(`task:${taskId}`, async () => {
      try {
        const task = await this.storage.writeOutcome(taskId, outcome);
        this.log.info("task outcome written", {
          taskId,
          runRef: run.pipelineRunId,
          status: run.status,
        });
        void this.activity.record({
          kind: "task-outcome",
          summary: `task ${outcome.status}: ${outcome.summary}`,
          refs: {
            taskId,
            runRef: run.pipelineRunId,
            status: outcome.status,
            ...(task.projectId ? { projectId: task.projectId } : {}),
          },
        });
        await this.recordRunCost(
          task.projectId,
          taskId,
          run.pipelineRunId,
          "pipeline",
          sumStageCosts(run.stageRuns),
        );
      } catch (error) {
        this.log.debug("task outcome write skipped", {
          taskId,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  private async writeGoalOutcome(taskId: string, run: GoalRun): Promise<void> {
    if (run.status !== "done" && run.status !== "failed") return;
    const verified = run.iterations.filter((i) => i.verifier.satisfied).length;
    const outcome: TaskOutcome = {
      status: run.status === "done" ? "done" : "error",
      summary: `${run.iterations.length} iterations, ${run.status}${verified ? `, verified` : ""}`,
      finishedAt: new Date().toISOString(),
    };
    // Finding #7 — see the lock comment on `writeAgentOutcome`.
    await withPathLock(`task:${taskId}`, async () => {
      try {
        const task = await this.storage.writeOutcome(taskId, outcome);
        this.log.info("task outcome written", {
          taskId,
          runRef: run.goalRunId,
          status: run.status,
        });
        void this.activity.record({
          kind: "task-outcome",
          summary: `task ${outcome.status}: ${outcome.summary}`,
          refs: {
            taskId,
            runRef: run.goalRunId,
            status: outcome.status,
            ...(task.projectId ? { projectId: task.projectId } : {}),
          },
        });
        // Phase 12: no cost line here — `GoalRunSchema` carries no top-level `costUsd`
        // (only its per-iteration makers do, tracked by `goal-runner.service.ts`'s own
        // `recordDispatch`, dispatch-only). Cost lines currently flow only from the
        // agent/pipeline outcome paths above.
      } catch (error) {
        this.log.debug("task outcome write skipped", {
          taskId,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  private async writeChainOutcome(taskId: string, run: ChainRun): Promise<void> {
    if (run.status !== "done" && run.status !== "failed") return;
    const outcome: TaskOutcome = {
      status: run.status === "done" ? "done" : "error",
      summary: `${run.steps.length} steps, ${run.status}`,
      finishedAt: new Date().toISOString(),
    };
    // Finding #7 — see the lock comment on `writeAgentOutcome`.
    await withPathLock(`task:${taskId}`, async () => {
      try {
        const task = await this.storage.writeOutcome(taskId, outcome);
        this.log.info("task outcome written", {
          taskId,
          runRef: run.chainRunId,
          status: run.status,
        });
        void this.activity.record({
          kind: "task-outcome",
          summary: `task ${outcome.status}: ${outcome.summary}`,
          refs: {
            taskId,
            runRef: run.chainRunId,
            status: outcome.status,
            ...(task.projectId ? { projectId: task.projectId } : {}),
          },
        });
        // Phase 12: no cost line here either — `ChainRunSchema` carries no `costUsd`
        // (a chain's steps are agent/pipeline runs whose own outcomes already record
        // their cost individually when THEY reach a terminal state).
      } catch (error) {
        this.log.debug("task outcome write skipped", {
          taskId,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * Best-effort cost-line write for a finished run (Phase 12) — only when both a
   * project and a known price exist; awaited so it lands before the caller's outer
   * try/catch returns, but {@link BudgetService.recordCost} itself never throws.
   */
  private recordRunCost(
    projectId: string | undefined,
    taskId: string,
    runRef: string,
    kind: string,
    costUsd: number | undefined,
  ): Promise<void> {
    if (!projectId || costUsd == null) return Promise.resolve();
    return this.budget.recordCost({ projectId, taskId, runRef, kind, costUsd });
  }

  /** Last non-empty log line of an agent run, truncated to one readable line. */
  private async agentRunSummary(runId: string): Promise<string> {
    const log = await this.agentRunner.readLog(runId, 0).catch(() => null);
    if (!log) return "";
    const lines = log.content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const last = lines[lines.length - 1] ?? "";
    return last.length > SUMMARY_MAX_CHARS ? `${last.slice(0, SUMMARY_MAX_CHARS - 1)}…` : last;
  }
}

/** Display id of a routing target (the orchestrator is synthetic, with no id). */
function targetIdOf(target: TaskTarget): string {
  return target.kind === "orchestrator" ? "orchestrator" : target.id;
}

/**
 * A subsystem's mythic display name for {@link SubsystemEmptyRosterError}'s
 * message — falls back to the raw id (never happens with a valid `SubsystemId`,
 * since {@link SUBSYSTEMS} is the closed registry it comes from).
 */
function subsystemDisplayName(id: SubsystemId): string {
  return SUBSYSTEMS.find((s) => s.id === id)?.name ?? id;
}

/**
 * Project a stored pipeline definition onto the routing-target shape — Phase 91's
 * 1-owned direct-dispatch path (mirrors `TaskClassifierService`'s own candidate
 * projection, minus the internal `search` blob this call site has no use for).
 */
function pipelineTaskTarget(p: Pipeline): TaskTarget {
  return { kind: "pipeline", id: p.id, name: p.name ?? p.id, glyph: "flow", avatar: p.avatar };
}

/** The activity ref the target contributes (agentId / pipelineId / chainId), if any. */
function refForTarget(target: TaskTarget): {
  agentId?: string;
  pipelineId?: string;
  chainId?: string;
} {
  if (target.kind === "agent") return { agentId: target.id };
  if (target.kind === "pipeline") return { pipelineId: target.id };
  if (target.kind === "chain") return { chainId: target.id };
  return {};
}
