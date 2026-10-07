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
  Agent,
  AgentRun,
  Attachment,
  ClassificationTrace,
  CreateTaskInput,
  CreateTaskResult,
  DepartmentId,
  Employee,
  GoalRun,
  Project,
  ScheduledTask,
  TaskOutcome,
  TaskOutput,
  TaskTarget,
  Workflow,
  WorkflowRun,
} from "@zibby/contracts";
import { WORKFLOW_COMPLEXITY_ORDER } from "@zibby/contracts";
import { ORCHESTRATOR_TARGET } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import type { AttachmentSetRefProvider } from "./attachment-set-ref-provider";
import { ATTACHMENT_SET_REF_PROVIDER } from "./attachment-set-ref-provider";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { AgentRunnerService, type RunAttachments } from "../agents/agent-runner.service";
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service";
import { type BudgetOverMetrics, BudgetService } from "../budget/budget.service";
import { EmployeeAllocator, type EmployeeLease } from "../employees/employee-allocator";
import { NoEmployeeError } from "../employees/employees.errors";
import { EmployeesStorageService } from "../employees/employees.storage.service";
import { type FuseSlot, WorkingAgentsFuse } from "../employees/working-agents-fuse";
import { GateEvaluatorService } from "../gates/gate-evaluator.service";
import { WatcherHealthRegistry } from "../health/watcher-health.registry";
import { LimitsService } from "../limits/limits.service";
import { GoalRunnerService } from "../goals/goal-runner.service";
import { WorkflowRunnerService } from "../workflows/workflow-runner.service";
import { WorkflowsStorageService } from "../workflows/workflows.storage.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { matchProject } from "../projects/project-matcher";
import { outsideLocks, withPathLock } from "../shared/file-storage";
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
import { taskTargetId } from "./task-target";

/** A create input with its attachment set resolved once (Task 6 — resolve, then thread). */
type CreateTaskInputResolved = CreateTaskInput & { attachments: Attachment[] };

/** A dispatch that started a run. */
type Dispatched = { runRef: string; target: TaskTarget; classification?: ClassificationTrace };
/** The position a queued task waits for a free employee of. */
type StaffWait = { department: DepartmentId; agentId: string };
/** {@link TaskSchedulerService.tryLeaseForDispatch}'s answer. */
type StaffLease = { lease: EmployeeLease } | { busy: StaffWait } | { unleashed: true };
/**
 * A dispatch that resolved its target but could not start it yet (staffing-driven
 * capacity): no machine-fuse slot, or — with `waitingForStaff` — no free employee for
 * its first stage. The caller persists it `queued` with the target, so the next
 * attempt dispatches straight to it without re-classifying.
 */
type QueuedDispatch = {
  queued: true;
  target: TaskTarget;
  classification?: ClassificationTrace;
  waitingForStaff?: StaffWait;
};

function isQueued(x: Dispatched | QueuedDispatch): x is QueuedDispatch {
  return "queued" in x;
}

/** See {@link TaskSchedulerService.resolveDepartmentTargetOrNull}. */
interface DepartmentResolution {
  target: TaskTarget;
  stage2?: NonNullable<ClassificationTrace["stage2"]>;
}

/** Thrown when there is nothing to route to (empty catalog) → the controller maps it to 422. */
export class EmptyCatalogError extends Error {
  constructor() {
    super("No agents or workflows available to route to");
    this.name = "EmptyCatalogError";
  }
}

/**
 * Phase 91 — thrown when a task explicitly targets a department with ZERO owned
 * workflows. A described task must never silently no-op (Law 5), and a mandate
 * without capability shouldn't pretend to execute (deliberate v1 floor: this does
 * NOT fall back to the orchestrator) — so it surfaces as a clear, immediate,
 * Czech-language validation rejection instead. The controller maps it to 422,
 * mirroring {@link EmptyCatalogError}.
 */
export class DepartmentEmptyRosterError extends Error {
  constructor(departmentName: string) {
    super(`Oddělení ${departmentName} zatím nemá žádnou workflow.`);
    this.name = "DepartmentEmptyRosterError";
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
/** Workflow run statuses that free a concurrency slot. */
const TERMINAL_WORKFLOW = new Set<WorkflowRun["status"]>(["done", "failed"]);
/** Goal run statuses that free a concurrency slot (Phase 10). */
const TERMINAL_GOAL = new Set<GoalRun["status"]>(["done", "failed"]);

/**
 * The deferred-task daemon. {@link createTask} is the single action behind the New
 * Task dialog: a task with no (or a past) `scheduledAt` is classified and dispatched
 * immediately; a future `scheduledAt` is parked in storage for the once-a-minute
 * {@link tick} to fire when due. Dispatch routes through the normal runners — so a
 * scheduled task still hits the approval gate exactly like an immediate one.
 *
 * Phase 8: before any immediate or fired dispatch, the task is attributed to an
 * engagement ({@link matchProject}, deterministic + token-free) and run through the
 * budget guard ({@link attemptDispatch}). Over a budget cap → the task is HELD behind
 * a Tier-3 `spend-past-cap` approval (Law 3: no autonomous spend past budget).
 *
 * Staffing-driven capacity (docs/plans/zibbycorp/staffing-driven-capacity.md): there
 * is no "how many tasks at once" cap. A task is QUEUED (no approval) only when it
 * cannot start NOW — no free employee for its first stage (`waitingForStaff`), or no
 * {@link WorkingAgentsFuse} slot. The queue drains when an employee or a fuse slot
 * frees up: round-robin across projects, FIFO inside one.
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
  protected readonly watcherId = "task-scheduler" as const;
  /**
   * Task ids the operator has approved to spend past budget (release-once). A
   * released task that has to wait for a concurrency slot re-enters the queue, and
   * the drain must NOT re-hold it for the same overage — it skips the budget check
   * for ids in this set, then clears the id once it actually dispatches. In-memory
   * by design: the approval record is the durable source of truth across restart.
   */
  private readonly budgetApproved = new Set<string>();
  /**
   * D-017: the employee leased to each in-flight single-agent run, keyed by its
   * `runId` — set right after a successful `agentRunner.start()`, released by the
   * `onRunStatus` subscriber below once the run reaches a terminal status. Absent
   * for a run that never leased (the department's position has no employee
   * anywhere — D-017's unleased fallback — or the orchestrator, which is never a
   * position an employee holds).
   */
  private readonly employeeLeases = new Map<string, EmployeeLease>();
  /**
   * The machine-fuse slot each in-flight single-agent / orchestrator run holds, keyed
   * by `runId` — taken in {@link dispatch}, released on the run's terminal status
   * (after its lease). Goal runs take none (a lifetime slot would deadlock with the
   * goal's own workflow stages); workflow stages take theirs in the workflow runner.
   */
  private readonly fuseSlots = new Map<string, FuseSlot>();
  /** A drain is queued behind `scheduler:drain` but not started — see {@link requestDrain}. */
  private drainRequested = false;

  constructor(
    private readonly storage: ScheduledTasksStorageService,
    private readonly classifier: TaskClassifierService,
    private readonly agentRunner: AgentRunnerService,
    private readonly workflowRunner: WorkflowRunnerService,
    private readonly workflowsStore: WorkflowsStorageService,
    /** F2b — for {@link resolveDepartmentTargetOrNull}'s owned-roster count (workflows + agents). */
    private readonly agentsStore: AgentsStorageService,
    /** D-017: the single-agent dispatch lease/release path (see {@link employeeLeases}). */
    private readonly employeeAllocator: EmployeeAllocator,
    private readonly employeesStore: EmployeesStorageService,
    /** Staffing-driven capacity: the machine fuse every agent dispatch takes a slot from. */
    private readonly fuse: WorkingAgentsFuse,
    private readonly goalRunner: GoalRunnerService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
    private readonly activity: ActivityLogService,
    private readonly projects: ProjectsStorageService,
    private readonly budget: BudgetService,
    private readonly approvals: ApprovalsService,
    private readonly gates: GateEvaluatorService,
    private readonly limits: LimitsService,
    private readonly taskOutput: TaskOutputService,
    private readonly systemConfig: SystemConfigStore,
    private readonly namer: ClaudeCliTaskNamer,
    private readonly attachmentStorage: AttachmentStorageService,
    /** F6c — the heartbeat probe registry this watcher self-registers into. */
    private readonly watcherHealthRegistry: WatcherHealthRegistry,
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
        if (TERMINAL_AGENT.has(run.status)) {
          // D-017: release this run's leased employee (if any) back to the
          // allocator — the best waiting acquire() for the same position wakes —
          // THEN its fuse slot. Either release notifies `onFreed` → drain.
          const lease = this.employeeLeases.get(run.runId);
          if (lease) {
            this.employeeAllocator.release(lease);
            this.employeeLeases.delete(run.runId);
          }
          this.fuseSlots.get(run.runId)?.();
          this.fuseSlots.delete(run.runId);
          this.requestDrain();
        }
      }),
      this.workflowRunner.onRunStatus((run) => {
        if (run.taskId) void this.writeWorkflowOutcome(run.taskId, run);
        if (TERMINAL_WORKFLOW.has(run.status)) this.requestDrain();
      }),
      this.goalRunner.onRunStatus((run) => {
        if (run.taskId) void this.writeGoalOutcome(run.taskId, run);
        if (TERMINAL_GOAL.has(run.status)) this.requestDrain();
      }),
      this.fuse.onFreed(() => this.requestDrain()),
      this.employeeAllocator.onFreed(() => this.requestDrain()),
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
    // F6c: self-register the heartbeat probe.
    this.watcherHealthRegistry.register(() => this.watcherHealth());
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
     * proposed-task whose suggested target is a goal/agent/workflow). The immediate
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
    // Phase 91: an explicit department target is resolved to a concrete workflow
    // target HERE — before either persistence path below (scheduled or immediate)
    // — so a 0-owned rejection is a clean validation error, never a task record
    // that later fails on dispatch. See `resolveDepartmentTarget`.
    // `routingText` when the caller supplied one: stage 2 runs HERE, so it must read the
    // same footer-free text stage 1 was given, or the framing the roadmap gate appends
    // for the actor lands right back in the ranker's haystack (see
    // `CreateTaskInput.routingText`).
    const target =
      rawTarget?.kind === "department"
        ? await this.resolveDepartmentTarget(
            rawTarget,
            input.routingText ?? input.text,
            input.paths ?? [],
            input.output,
          )
        : rawTarget;
    // O-18 — resolve the creator's source stamp when the caller didn't already
    // supply one (channel/automation stamp their own): the explicit
    // `@department` target legs here, everything else is the operator.
    resolvedInput.source =
      input.source ?? (rawTarget?.kind === "department" ? "department" : "operator");
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
   * Phase 91 / F2a / F2b — resolve a department target to a concrete workflow or
   * agent target (the design doc's 0/1/N-owned-unit rule, widened in F2b from
   * workflows-only to workflows + owned active agents):
   *  - **0 owned** → `null` — no capability to delegate to.
   *  - **1 owned** → dispatches straight to it; the classifier is never called.
   *  - **2+ owned** → `TaskClassifierService.classifyWithinDepartment`, restricted
   *    to just the department's own roster (never the full catalog, never a
   *    fallback to the orchestrator here — the operator, or the switchboard's
   *    stage-1 verdict, already named the department; `classifyWithinDepartment`'s
   *    own `department.fallback` policy decides what "not confident" resolves to).
   *
   * The resolved target IS the run's "via <department>" attribution: any
   * consumer can already read `Workflow.department`/`Agent.department`
   * (Phase 81 / F1a) off the dispatched id, so this adds no new run-level field.
   *
   * Two callers choose differently on `null` — see {@link resolveDepartmentTarget}
   * (the explicit `@mention` path, throws) and {@link dispatch} (the undirected
   * switchboard path, falls back to {@link ORCHESTRATOR_TARGET}).
   */
  /**
   * The outcome of resolving a department verdict to the unit that actually runs:
   * the `target`, plus the stage-2 rationale for the persisted trace.
   *
   * `stage2` is absent only when the classifier returned nothing usable and the
   * fallback unit was taken — there is no verdict to describe in that case. The
   * pairing exists because the previous shape returned the target alone, so the
   * decision that picks the running unit left no record at all.
   */
  private async resolveDepartmentTargetOrNull(
    target: Extract<TaskTarget, { kind: "department" }>,
    text: string,
    paths: string[],
    /**
     * The task's required sink, when it has one. A `pr` sink makes this resolution a
     * SIZING choice over the department's PR-capable workflows instead of a free pick
     * over its whole roster — mirroring `TaskClassifierService.constrainByOutput`, so
     * a direct dispatch and the scoped classifier agree on what is even eligible.
     * Without it a roadmap item that must open a PR could resolve to an agent that
     * cannot open one.
     */
    output?: TaskOutput,
  ): Promise<DepartmentResolution | null> {
    const [allWorkflows, allAgents, employees] = await Promise.all([
      this.workflowsStore.list().catch((): Workflow[] => []),
      this.agentsStore.listActive().catch((): Agent[] => []),
      this.employeesStore.list().catch((): Employee[] => []),
    ]);
    const ownedWorkflows = allWorkflows.filter((p) => p.department === target.id);
    // D-015: an agent (a position) is "owned" by this department IFF it has at
    // least one active employee here — `Agent.department` is no longer read.
    const ownedPositionIds = new Set(
      employees
        .filter((e) => e.status === "active" && e.department === target.id)
        .map((e) => e.agentId),
    );
    const ownedAgents = allAgents.filter((a) => ownedPositionIds.has(a.id));
    const totalOwned = ownedWorkflows.length + ownedAgents.length;
    if (totalOwned === 0) return null;
    // Same rule, same reason as the classifier's own filter: a task that must end in a
    // PR is eligible only for workflows that DECLARE a `pr` sink — never a lone agent.
    // Falls back to the full roster (and warns) when the department owns no such
    // workflow, because "route it somewhere and let the run fail" is strictly worse
    // than routing it the old way and saying so.
    const prCapable = ownedWorkflows.filter((p) => p.outputs.some((o) => o.type === "pr"));
    const prConstrained = output?.type === "pr" && prCapable.length > 0;
    if (output?.type === "pr" && prCapable.length === 0) {
      this.log.warn("task requires a PR but the department owns no PR-capable workflow", {
        department: target.id,
        ownedUnits: totalOwned,
      });
    }
    const eligibleWorkflows = prConstrained ? prCapable : ownedWorkflows;
    const eligibleCount = prConstrained ? prCapable.length : totalOwned;
    // Cheapest WORKFLOW first, else the sole agent — deliberately the same rule as
    // `TaskClassifierService.cheapestWorkflow`, so a direct dispatch agrees with
    // what the scoped classifier would have chosen as its `"primary"` fallback.
    //
    // NS2 F9 note: this used to be plain `ownedWorkflows[0]` and a comment claiming
    // it mirrored `departmentCandidates`' workflows-first ordering. F9 reversed that
    // ordering (agents first, then workflows by rung) AND moved the fallback off
    // list order onto the ladder, which left this reading FILE order — so a
    // department whose directory happens to list a `deep` workflow before its
    // `light` one would dispatch the expensive rung here while the classifier
    // picked the cheap one. Sorting by the ladder restores the agreement the
    // comment only claimed.
    const cheapestWorkflow = [...eligibleWorkflows].sort(
      (a, b) =>
        WORKFLOW_COMPLEXITY_ORDER.indexOf(a.complexity) -
        WORKFLOW_COMPLEXITY_ORDER.indexOf(b.complexity),
    )[0];
    const primary = cheapestWorkflow
      ? workflowTaskTarget(cheapestWorkflow)
      : agentTaskTarget(ownedAgents[0]!);
    // One eligible unit → it IS the answer; classifying a single-entry catalog would
    // spend a round-trip to be told what the constraint already decided.
    if (eligibleCount === 1) {
      this.log.info("stage-2 resolved without classifying — one eligible unit", {
        department: target.id,
        target: `${primary.kind}:${taskTargetId(primary)}`,
        ...(prConstrained ? { constrainedBy: "pr-output" } : {}),
      });
      return {
        target: primary,
        stage2: {
          target: primary,
          // Not a judgment: the constraint (or the roster) left one option, so calling
          // this a high-confidence "decision" would overstate what happened.
          confidence: 1,
          reason: prConstrained
            ? "Only one owned unit can deliver a PR — no ranking was needed."
            : "The department owns a single dispatchable unit — no ranking was needed.",
          rankedCandidates: 1,
          ...(prConstrained ? { constrainedBy: "pr-output" as const } : {}),
        },
      };
    }
    const routing = await this.classifier.classifyWithinDepartment(
      { text, paths, ...(output ? { output } : {}) },
      target.id,
    );
    // Stage 2 is the decision that picks the thing that actually RUNS, and its
    // rationale used to be dropped here (`routing?.target ?? primary`) — which is why
    // diagnosing a misroute meant reverse-engineering the confidence curve by hand
    // instead of reading a record. Logged with the leg that produced it, so a silent
    // degradation to the keyword scorer is visible rather than indistinguishable from
    // a real decision.
    if (routing) {
      this.log.info("stage-2 verdict", {
        department: target.id,
        target: `${routing.target.kind}:${"id" in routing.target ? routing.target.id : "-"}`,
        confidence: routing.confidence,
        reason: routing.reason,
        leg: routing.leg ?? "unknown",
        rankedCandidates: routing.candidates.length,
        ...(prConstrained ? { constrainedBy: "pr-output" } : {}),
      });
    }
    // Defensive only: `classifyWithinDepartment` returns null solely for an empty
    // candidate set, which `eligibleCount > 1` already rules out.
    if (!routing) return { target: primary };
    return {
      target: routing.target,
      stage2: {
        target: routing.target,
        confidence: routing.confidence,
        reason: routing.reason,
        rankedCandidates: routing.candidates.length,
        ...(routing.leg ? { leg: routing.leg } : {}),
        ...(prConstrained ? { constrainedBy: "pr-output" as const } : {}),
      },
    };
  }

  /**
   * The EXPLICIT-target wrapper around {@link resolveDepartmentTargetOrNull}:
   * called once, up front, by {@link createTask} before any persistence, for an
   * `@`-mentioned department target. A mandate without capability shouldn't
   * pretend to execute (deliberate v1 floor) — 0 owned workflows rejects
   * immediately with {@link DepartmentEmptyRosterError}, a clear Czech validation
   * message, rather than silently falling back to the orchestrator.
   */
  private async resolveDepartmentTarget(
    target: Extract<TaskTarget, { kind: "department" }>,
    text: string,
    paths: string[],
    output?: TaskOutput,
  ): Promise<TaskTarget> {
    const resolved = await this.resolveDepartmentTargetOrNull(target, text, paths, output);
    if (!resolved) throw new DepartmentEmptyRosterError(target.name || target.id);
    return resolved.target;
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
    // Safety net: a missed release event (or a drain pass that skipped a workflow)
    // never strands a queued task for longer than one heartbeat.
    this.requestDrain();
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
   * Run `fn` exclusively for `projectId` (finding #9 — the budget check→record race:
   * `budget.check` → the real `dispatch` → `recordLedger`, unserialized, let two
   * concurrent creates for the same project both pass the gate and both dispatch,
   * over-recording the ledger past its cap — a Law-3 violation).
   * `project-capacity:${projectId}` is disjoint from the `task:${id}` outcome-writer
   * lock and the global `scheduler:drain` sweep lock. An unattributed dispatch has no
   * project budget, so it runs unlocked. Staffing (employees + the machine fuse) needs
   * no lock here: both are granted synchronously in-process, never check-then-act.
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
   * The shared budget guard: over budget → hold behind approval (persisted, surfaced
   * as `outcome: "scheduled"`). Returns
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
    return { ok: true };
  }

  /**
   * The immediate-create guard: attribute, budget-check, then either hold, queue, or
   * dispatch — returning the client-facing {@link CreateTaskResult}. A held/queued
   * task surfaces as `outcome: "scheduled"` (a parked task the feed renders by status).
   *
   * Finding #9 (Critical, budget check→record race): the synchronous branch runs its ENTIRE guard+dispatch as one normal
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
   *  1. The gate ({@link guardCapacity}) — held still returns fast, exactly as
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
   * check (neither has dispatched yet, so `budget.check` still reads "under cap").
   * `dispatchPending` closes this gap itself: it re-verifies the budget
   * ({@link guardExisting}) immediately before the real dispatch, now properly
   * serialized (same lock, FIFO) against every other real dispatch for the project —
   * a task that loses this recheck flips `pending → held` instead of also
   * dispatching. A dispatch that finds no free employee / fuse slot flips it
   * `pending → queued`.
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
    if (isQueued(dispatched)) {
      const task = await this.storage.createQueued(taskId, input, projectId, now, dispatched);
      this.recordQueued(task, project);
      return { outcome: "scheduled", task };
    }
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
              "No agents or workflows available to route to",
            );
            return;
          }
          if (isQueued(dispatched)) {
            this.recordQueued(await this.storage.markQueued(task.id, dispatched), project);
            return;
          }
          await this.recordLedger(task.id, projectId, dispatched);
          const department = await this.ownerDepartmentOf(dispatched);
          const updated = await this.storage.markDispatched(
            task.id,
            dispatched.runRef,
            dispatched.target,
            dispatched.classification,
            department,
          );
          await this.recordDispatchedActivity(task.id, projectId, dispatched);
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
   * Budget guard for an ALREADY-PERSISTED task — marks it held IN PLACE
   * (`storage.markHeld`) rather than creating a new held record ({@link guardCapacity} does that, for a task not yet persisted). Shared by
   * {@link attemptDispatch} (the tick/drain/release paths) and `dispatchPending`'s
   * pre-dispatch recheck (findings #8/#9 — see {@link attemptCreate}'s doc comment).
   */
  private async guardExisting(
    task: ScheduledTask,
    project: Project | null,
    at: Date,
    skipBudget: boolean,
  ): Promise<"ok" | "held"> {
    if (!skipBudget) {
      const check = await this.budget.check(task.projectId, at);
      if (!check.ok) {
        await this.storage.markHeld(task.id, check.detail);
        await this.holdForApproval(task, project, check.detail, check.metrics);
        return "held";
      }
    }
    return "ok";
  }

  /**
   * The guard for an EXISTING task record (the tick fire path, the queue drain, and
   * the release path). Returns the resulting state. `skipBudget` is the release-once
   * bypass — an operator-approved overage skips the budget check but still waits
   * for staff / a fuse slot. Records the budget ledger line on every actual dispatch.
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
    // Phase 10: a task that already carries a target (e.g. a goal, never classifiable,
    // or a task queued for staff/fuse after its classification) re-dispatches to it;
    // otherwise classify as before.
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
      task.classification,
    );
    if (!dispatched) {
      await this.storage.markFailed(task.id, "No agents or workflows available to route to");
      this.log.warn("task failed: empty catalog", { id: task.id });
      return "failed";
    }
    if (isQueued(dispatched)) {
      this.recordQueued(await this.storage.markQueued(task.id, dispatched), project);
      return "queued";
    }
    await this.recordLedger(task.id, task.projectId, dispatched);
    const department = await this.ownerDepartmentOf(dispatched);
    const updated = await this.storage.markDispatched(
      task.id,
      dispatched.runRef,
      dispatched.target,
      dispatched.classification,
      department,
    );
    this.budgetApproved.delete(task.id);
    void this.reconcileOutcome(updated);
    await this.recordDispatchedActivity(task.id, task.projectId, dispatched);
    this.log.info("task dispatched", {
      id: task.id,
      runRef: dispatched.runRef,
      projectId: task.projectId,
    });
    return "dispatched";
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
   * Fire-and-forget {@link drainQueues} from a listener that may run INSIDE a held
   * lock (a fuse slot released mid-drain notifies `onFreed` synchronously) — started
   * outside every lock so it queues behind `scheduler:drain` instead of re-entering
   * it inline (file-lock.ts CONTRACT).
   */
  private requestDrain(): void {
    // Coalesce: one drain already queued (not yet started) will see whatever this
    // request would have — a run end fires lease-release, fuse-release and terminal.
    if (this.drainRequested) return;
    this.drainRequested = true;
    outsideLocks(() => void this.drainQueues());
  }

  /**
   * Drain the staffing queue: dispatch queued tasks while the machine fuse has room,
   * round-robin across projects (each project's 1st task, then each project's 2nd, …),
   * FIFO inside one. A task waiting for an employee is skipped (left untouched) while
   * its position is still fully busy, so a busy position never blocks other tasks. A
   * normal queued task re-runs the full guard (budget first — it can become held if
   * the budget filled meanwhile); a released (budget-approved) task skips only the
   * budget check.
   */
  private drainQueues(): Promise<void> {
    // Serialize all drains: many release events fire near-simultaneously, and two
    // overlapping drains would both read the same task as `queued` and dispatch it
    // twice (a TOCTOU double-dispatch). The lock makes each drain see the prior
    // drain's markDispatched, so a queued task is dispatched exactly once.
    return withPathLock("scheduler:drain", async () => {
      this.drainRequested = false; // started: a request from here on queues another pass
      const queued = (await this.storage.list().catch((): ScheduledTask[] => []))
        .filter((t) => t.status === "queued")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const seen = new Map<string | undefined, number>();
      const ordered = queued
        .map((task) => {
          const turn = seen.get(task.projectId) ?? 0;
          seen.set(task.projectId, turn + 1);
          return { task, turn };
        })
        .sort((a, b) => a.turn - b.turn || a.task.createdAt.localeCompare(b.task.createdAt));
      // A workflow probe reserves nothing (the runner leases per stage later), so two
      // queued workflows with the same first stage would both pass it in one pass.
      // ponytail: one workflow per first-stage position per pass, even when several
      // employees are free; the rest wait for the next drain (any release / tick).
      const handedOut = new Set<string>();
      for (const { task } of ordered) {
        if (!this.fuse.hasRoom()) return; // nothing can start anywhere right now
        // Re-read: a concurrent cancel may have moved it on already.
        const fresh = await this.storage.get(task.id).catch((): ScheduledTask | null => null);
        if (!fresh || fresh.status !== "queued") continue;
        const wait = fresh.waitingForStaff;
        if (wait && !(await this.employeeAllocator.canStaffNow(wait.department, wait.agentId))) {
          continue;
        }
        const stage =
          fresh.target?.kind === "workflow" ? await this.firstStage(fresh.target.id) : null;
        const stageKey = stage && `${stage.department}::${stage.agentId}`;
        if (stageKey && handedOut.has(stageKey)) continue;
        const project = fresh.projectId
          ? await this.projects.get(fresh.projectId).catch((): Project | null => null)
          : null;
        // Finding #8 (A.2): nest the per-project `project-capacity` lock inside the
        // global `scheduler:drain` sweep lock — different keys, ordinary nesting — so
        // a drain's dispatch is serialized against a concurrent `attemptCreate` or
        // `releaseHeld` for the same project, not just against other drains.
        const result = await this.trace.run({ traceId: randomUUID() }, () =>
          this.withCapacityLock(fresh.projectId, () =>
            this.attemptDispatch(fresh, project, Date.now(), {
              skipBudget: this.budgetApproved.has(fresh.id),
            }),
          ),
        );
        if (stageKey && result === "dispatched") handedOut.add(stageKey);
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
     * The task's chosen terminal output. Threaded into a workflow route here (it
     * overrides the workflow's declared `outputs:` for this run). For an
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
    /**
     * The trace a previous attempt classified this task with (a task queued for staff
     * or a fuse slot persists its target + trace). Used with `explicitTarget` so the
     * re-dispatch keeps its department and memory terms without re-classifying.
     */
    priorClassification?: ClassificationTrace,
  ): Promise<Dispatched | QueuedDispatch | null> {
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
    // F2c: the persisted classification trace — only set on the undirected classify
    // path (an explicit target was never classified, so there is nothing to trace).
    let classification: ClassificationTrace | undefined;
    if (explicitTarget) {
      target = explicitTarget;
      classification = priorClassification;
      matchedTerms = priorClassification?.matchedTerms ?? [];
    } else {
      // `output` rides into the classify so the required sink constrains stage 2 the
      // same way it does on the explicit/roadmap path (`createTask`) — one rule, both
      // entry points.
      const routing = await this.classifier.classify({
        text,
        paths,
        ...(output ? { output } : {}),
      });
      if (!routing) return null;
      target = routing.target;
      // The classifier's matched terms ride into the run so memory grounding selects
      // the same MOCs the routing keyed on (Phase 4).
      matchedTerms = routing.matchedTerms;
      // F2a — the switchboard may now emit a whole-department verdict (never the
      // explicit `@mention` path above, which is already resolved by `createTask`
      // before `dispatch` is ever called). Soft stage-2: resolve to a concrete
      // workflow, or — an empty roster — fall through to the orchestrator exactly
      // like any other "nothing matched confidently" verdict (the terminal block
      // below, unchanged, already records `orchestrator-fallback` for a
      // non-explicit target and starts the orchestrator).
      let department: DepartmentId | undefined;
      let stage2: ClassificationTrace["stage2"];
      if (target.kind === "department") {
        department = target.id;
        const resolved = await this.resolveDepartmentTargetOrNull(target, text, paths, output);
        target = resolved?.target ?? ORCHESTRATOR_TARGET;
        stage2 = resolved?.stage2;
      }
      classification = {
        stage1: routing.target,
        confidence: routing.confidence,
        reason: routing.reason,
        matchedTerms: routing.matchedTerms,
        ...(department ? { department } : {}),
        ...(routing.leg ? { leg: routing.leg } : {}),
        ...(stage2 ? { stage2 } : {}),
      };
    }
    if (target.kind === "agent") {
      // Staffing gate, BEFORE any spawn: a fuse slot, then an employee (D-017 —
      // never leased inside `AgentRunnerService`, since a workflow stage also spawns
      // an agent run and leases per stage itself). Both are held until the run's
      // terminal status. See `tryLeaseForDispatch` for the lease ladder.
      const slot = this.fuse.tryTake({ projectId });
      if (!slot) return { queued: true, target, classification };
      let staff: StaffLease;
      try {
        staff = await this.tryLeaseForDispatch(target.id, classification?.department, projectId);
      } catch (error) {
        slot();
        throw error;
      }
      if ("busy" in staff) {
        slot();
        return { queued: true, target, classification, waitingForStaff: staff.busy };
      }
      const lease = "lease" in staff ? staff.lease : undefined;
      let run: AgentRun;
      try {
        // A conditional call (not a trailing `lease ? {...} : undefined` arg) so an
        // unleased dispatch's call arity is byte-for-byte identical to before D-017
        // — existing `toHaveBeenCalledWith` fixtures assert an exact argument list.
        run = lease
          ? await this.agentRunner.start(
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
              { employeeId: lease.employeeId, employeeName: lease.employeeName },
            )
          : await this.agentRunner.start(
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
      } catch (error) {
        // The spawn itself failed (e.g. preflight) — the run never entered the
        // registry, so it will never reach the terminal `onRunStatus` release path.
        if (lease) this.employeeAllocator.release(lease);
        slot();
        throw error;
      }
      this.holdUntilTerminal(run, slot, lease);
      return { runRef: run.runId, target, classification };
    }
    if (target.kind === "workflow") {
      // Check (never reserve) fuse room + a free employee for the first agent stage:
      // the workflow runner takes lease + fuse slot per stage itself.
      const wait = await this.workflowStaffing(target.id);
      if (wait) return { queued: true, target, classification, ...wait };
      // Task 8: attachments are intentionally NOT passed to a workflow target in v1 —
      // the workflow runner has no attachments seam yet (documented deferred gap).
      // The task's text is the workflow's first-phase input (its `consumes`, e.g. a
      // brief) — without it every stage runs blind to what the operator asked for.
      const run = await this.workflowRunner.start(
        target.id,
        taskId,
        projectId,
        matchedTerms,
        undefined,
        output,
        text,
      );
      return { runRef: run.workflowRunId, target, classification };
    }
    if (target.kind === "goal") {
      // Phase 10: route a goal-targeted task through the outer-loop runner. It flows
      // the projectId/taskId through so the goal writes its outcome back exactly like
      // any other dispatched run. Not fuse-gated: a lifetime slot would deadlock with
      // the goal's own workflow stages, which take theirs per stage.
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
      return { runRef: run.goalRunId, target, classification };
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
    // subagent(s) or does the task directly — a task never no-ops. It holds a fuse
    // slot (no lease: the orchestrator is no position an employee holds).
    const slot = this.fuse.tryTake({ projectId });
    if (!slot) return { queued: true, target, classification };
    let run: AgentRun;
    try {
      run = await this.agentRunner.startOrchestrator(
        text,
        paths,
        title,
        taskId,
        matchedTerms,
        projectId ?? "",
        runAttachments,
      );
    } catch (error) {
      slot();
      throw error;
    }
    this.holdUntilTerminal(run, slot);
    return { runRef: run.runId, target, classification };
  }

  /**
   * Record a started run's fuse slot (+ lease) for release on its terminal status —
   * unless the run ALREADY ended: a fast-failing child can emit its terminal status
   * while `start()` is still awaiting (RunnerCore's sidecar write), so the
   * `onRunStatus` release found nothing. Then release both now instead of leaking them.
   */
  private holdUntilTerminal(run: AgentRun, slot: FuseSlot, lease?: EmployeeLease): void {
    let status = run.status;
    try {
      status = this.agentRunner.get(run.runId).status; // the live registry status
    } catch {
      // Not in the registry (already evicted) — the returned snapshot is all we have.
    }
    if (TERMINAL_AGENT.has(status)) {
      if (lease) this.employeeAllocator.release(lease);
      slot();
      return;
    }
    if (lease) this.employeeLeases.set(run.runId, lease);
    this.fuseSlots.set(run.runId, slot);
  }

  /**
   * D-017: the single-agent-run lease ladder, non-blocking. A department already known
   * (the task's own classification traced a department verdict) leases from THAT
   * department first; failing that — or when no department is known at all — any
   * department that currently employs the position. `busy` when every such employee is
   * leased (the task queues with `waitingForStaff`); `unleashed` only when the
   * position has no employee anywhere — D-017's "a described task is always executed"
   * fallback, never a park (that's workflows only).
   */
  private async tryLeaseForDispatch(
    agentId: string,
    department: DepartmentId | undefined,
    projectId: string | undefined,
  ): Promise<StaffLease> {
    const ctx = { rank: { projectId } };
    if (department) {
      try {
        const lease = await this.employeeAllocator.tryAcquire(department, agentId, ctx);
        return lease ? { lease } : { busy: { department, agentId } };
      } catch (error) {
        if (!(error instanceof NoEmployeeError)) throw error;
        // Fall through — try any department that employs the position.
      }
    }
    const candidates = await this.employeesStore.listActiveByPositionAnyDepartment(agentId);
    if (candidates.length === 0) return { unleashed: true };
    for (const dept of new Set(candidates.map((e) => e.department))) {
      try {
        const lease = await this.employeeAllocator.tryAcquire(dept, agentId, ctx);
        if (lease) return { lease };
      } catch (error) {
        if (!(error instanceof NoEmployeeError)) throw error;
      }
    }
    return { busy: { department: candidates[0]!.department, agentId } };
  }

  /**
   * Can a workflow start right now? `null` = yes; otherwise why it must queue: no fuse
   * room (`{}`), or its first agent stage's position fully busy (`waitingForStaff`).
   * A probe only — nothing is taken; the workflow runner leases per stage.
   */
  private async workflowStaffing(
    workflowId: string,
  ): Promise<{ waitingForStaff?: StaffWait } | null> {
    if (!this.fuse.hasRoom()) return {};
    const stage = await this.firstStage(workflowId);
    if (!stage) return null;
    const free = await this.employeeAllocator.canStaffNow(stage.department, stage.agentId);
    return free ? null : { waitingForStaff: stage };
  }

  /** A workflow's first agent stage as `(department, position)`, or null when it has none. */
  private async firstStage(workflowId: string): Promise<StaffWait | null> {
    const workflows = await this.workflowsStore.list().catch((): Workflow[] => []);
    const workflow = workflows.find((w) => w.id === workflowId);
    const agentId = workflow?.phases.find((ph) => ph.agent)?.agent;
    return workflow?.department && agentId ? { department: workflow.department, agentId } : null;
  }

  /** Persist an immediately-dispatched task + its activity (the create path). */
  private async persistDispatched(
    taskId: string,
    input: CreateTaskInputResolved,
    dispatched: Dispatched,
    projectId: string | undefined,
    now: number,
  ): Promise<ScheduledTask> {
    await this.recordLedger(taskId, projectId, dispatched, now);
    // ZB-04a / O-06 — the department this run's dispatched unit belongs to,
    // stamped onto the task record at dispatch time (never earlier — see
    // `ScheduledTaskSchema.department`).
    const department = await this.ownerDepartmentOf(dispatched);
    const task = await this.storage.createDispatched(
      taskId,
      input,
      dispatched.runRef,
      dispatched.target,
      now,
      projectId,
      dispatched.classification,
      department,
    );
    await this.recordDispatchedActivity(taskId, projectId, dispatched);
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

  /**
   * F2c: async now — awaits the best-effort {@link ownerDepartmentOf} store read
   * BEFORE calling `activity.record`, so the record call itself still lands
   * deterministically within the caller's own await chain (matching the old
   * synchronous-call guarantee) rather than racing off on an unawaited `.then()`.
   * The write itself stays fire-and-forget (`void this.activity.record(...)`).
   */
  private async recordDispatchedActivity(
    taskId: string,
    projectId: string | undefined,
    dispatched: { runRef: string; target: TaskTarget; classification?: ClassificationTrace },
  ): Promise<void> {
    const department = await this.ownerDepartmentOf(dispatched);
    void this.activity.record({
      kind: "task-dispatched",
      summary: `dispatched to ${dispatched.target.kind} ${targetIdOf(dispatched.target)}`,
      refs: {
        taskId,
        runRef: dispatched.runRef,
        status: dispatched.target.kind,
        ...(projectId ? { projectId } : {}),
        ...refForTarget(dispatched.target),
        ...(department ? { department } : {}),
      },
    });
  }

  /**
   * F2c — best-effort owning department for a dispatched activity entry: the
   * classification trace's own `department` when stage-1 delegated (cheapest,
   * already in hand); otherwise a guarded store read of the dispatched unit's
   * own `department` (a workflow/agent target only — nothing else carries
   * one). Never throws — attribution only (Law 4), so a store failure just
   * omits the ref rather than blocking the activity record.
   */
  private async ownerDepartmentOf(dispatched: {
    target: TaskTarget;
    classification?: ClassificationTrace;
  }): Promise<DepartmentId | undefined> {
    if (dispatched.classification?.department) return dispatched.classification.department;
    const { target } = dispatched;
    if (target.kind === "workflow") {
      const workflows = await this.workflowsStore.list().catch((): Workflow[] => []);
      return workflows.find((p) => p.id === target.id)?.department;
    }
    if (target.kind === "agent") {
      const agents = await this.agentsStore.listActive().catch((): Agent[] => []);
      return agents.find((a) => a.id === target.id)?.department;
    }
    return undefined;
  }

  private recordQueued(task: ScheduledTask, project: Project | null): void {
    const wait = task.waitingForStaff;
    const reason = wait
      ? `waiting for a free ${wait.agentId} in ${wait.department}`
      : "waiting for a machine-fuse slot";
    void this.activity.record({
      kind: "task-queued",
      summary: `task queued — ${reason}${project ? ` (${project.name})` : ""}`,
      refs: { taskId: task.id, ...(task.projectId ? { projectId: task.projectId } : {}) },
    });
    this.log.info("task queued", { id: task.id, projectId: task.projectId, waitingForStaff: wait });
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
      if (task.target?.kind === "workflow") {
        await this.writeWorkflowOutcome(task.id, this.workflowRunner.get(task.runRef));
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

  private async writeWorkflowOutcome(taskId: string, run: WorkflowRun): Promise<void> {
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
    // itself (the workflow runner already did, before this method ever runs), so the
    // race here is lower-harm (a duplicate activity line / lost-update on which run's
    // summary wins), but all four `writeXOutcome` writers lock the same way for
    // consistency.
    await withPathLock(`task:${taskId}`, async () => {
      try {
        const task = await this.storage.writeOutcome(taskId, outcome);
        this.log.info("task outcome written", {
          taskId,
          runRef: run.workflowRunId,
          status: run.status,
        });
        void this.activity.record({
          kind: "task-outcome",
          summary: `task ${outcome.status}: ${outcome.summary}`,
          refs: {
            taskId,
            runRef: run.workflowRunId,
            status: outcome.status,
            ...(task.projectId ? { projectId: task.projectId } : {}),
          },
        });
        await this.recordRunCost(
          task.projectId,
          taskId,
          run.workflowRunId,
          "workflow",
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
        // agent/workflow outcome paths above.
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
 * Project a stored workflow definition onto the routing-target shape — Phase 91's
 * 1-owned direct-dispatch path (mirrors `TaskClassifierService`'s own candidate
 * projection, minus the internal `search` blob this call site has no use for).
 */
function workflowTaskTarget(p: Workflow): TaskTarget {
  return { kind: "workflow", id: p.id, name: p.name ?? p.id, glyph: "flow", avatar: p.avatar };
}

/**
 * F2b — the agent counterpart of {@link workflowTaskTarget}: project a stored
 * agent definition onto the routing-target shape for the 1-owned direct-dispatch
 * path (a department that owns exactly one agent and no workflow).
 */
function agentTaskTarget(a: Agent): TaskTarget {
  return {
    kind: "agent",
    id: a.id,
    name: a.name ?? a.id,
    glyph: a.glyph ?? "bot",
    avatar: a.avatar,
  };
}

/** The activity ref the target contributes (agentId / workflowId), if any. */
function refForTarget(target: TaskTarget): {
  agentId?: string;
  workflowId?: string;
} {
  if (target.kind === "agent") return { agentId: target.id };
  if (target.kind === "workflow") return { workflowId: target.id };
  return {};
}
