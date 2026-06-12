import {
  type AgentRun,
  type Approval,
  ORCHESTRATOR_ID,
  type PipelineRun,
  type RunStatus,
  type ScheduledTask,
  type TaskTarget,
} from "@zibby/contracts";
import type { DotTone, IconName, TagTone } from "@zibby/design-system";

/**
 * The Runs screen is a task feed: what the user asked for is the headline, the
 * agent/pipeline the task was routed to is metadata. The contract has no unified
 * task-run list, so we merge the per-kind lists client-side into this view model
 * (agent runs + pipeline runs + still-waiting scheduled tasks), deriving the
 * missing display fields (see DESIGN_VS_API_NOTES.md).
 */
export type RunKind = "agent" | "pipeline" | "scheduled";

/** Feed status: the shared run states plus the not-yet-fired `scheduled`, the
 * retries-parked `parked` (approval-parked pipelines keep reading as
 * `awaiting-approval` — that mapping is load-bearing for the approvals gate), and
 * Phase 8's pre-dispatch budget holds `held` (over a cap, behind an approval) and
 * `queued` (waiting for a concurrency slot). */
export type FeedStatus = RunStatus | "scheduled" | "parked" | "held" | "queued";

export interface RunView {
  runId: string;
  kind: RunKind;
  /** The routed agent/pipeline id — `""` for a not-yet-dispatched scheduled task. */
  owner: string;
  status: FeedStatus;
  /** 0–100, or null for pipeline runs (no single percentage). */
  pct: number | null;
  /** Short human task name from the New Task dialog; `""` when absent. */
  title: string;
  prompt: string;
  project: string;
  /** Start time — for a scheduled task, the future fire time (sorts it to the top). */
  startedAt: string;
  /** Log endpoint base — null for pipeline runs and scheduled tasks (no log). */
  logBase: "agents" | null;
  /** The task record this run was dispatched from (when born from one). */
  taskId?: string;
  /** Enriched from the task record: its display title (or text). */
  taskTitle?: string;
  /** Enriched from the task record: the written-back run outcome. */
  taskOutcome?: "done" | "error";
  /** Retries-parked pipeline runs: the parked surface (phase, attempts, note). */
  parked?: PipelineRun["parked"];
  /** The engagement a task is attributed to (Phase 8) — drives the queued caption. */
  projectId?: string;
  /** Held tasks: why the budget guard parked it. */
  heldReason?: string;
  /** Held tasks: the spend-past-cap approval gating the override. */
  approvalId?: string;
  /** Phase 9: when `paused-limit`, the epoch ms the usage window resets (countdown). */
  resumeAt?: number | null;
  /** Phase 9: how many auto-resume cycles a limit-paused run has used ("2/3"). */
  limitResumeCycles?: number;
  /** Phase 9: a window-deferred scheduled task (`deferredReason === "limit"`). */
  deferredLimit?: boolean;
}

/** Task-first display name: explicit title, else the task text, else the target. */
export function runTitle(run: RunView): string {
  return run.title || run.prompt || run.owner;
}

/**
 * The pending approval that belongs to a run waiting on the gate. Agent runs
 * match exactly; a pipeline run's approval is keyed by the STAGE run id
 * (`${pipelineRunId}.${phaseId}_…`), so pipeline rows match on the prefix.
 * Generic so the enriched `DashboardApproval` view flows through unchanged.
 */
export function approvalForRun<A extends Pick<Approval, "runId">>(
  queue: readonly A[],
  run: Pick<RunView, "runId" | "kind" | "status">,
): A | undefined {
  if (run.status !== "awaiting-approval") return undefined;
  return queue.find(
    (a) =>
      a.runId === run.runId ||
      (run.kind === "pipeline" && a.runId.startsWith(`${run.runId}.`)),
  );
}

export function agentRunToView(r: AgentRun): RunView {
  return {
    runId: r.runId,
    kind: "agent",
    owner: r.agentId,
    status: r.status,
    pct: r.pct,
    title: r.title,
    prompt: r.prompt,
    project: r.project,
    startedAt: r.startedAt,
    logBase: "agents",
    taskId: r.taskId,
    resumeAt: r.resumeAt,
    limitResumeCycles: r.limitResumeCycles,
  };
}

/**
 * Pipeline run → view. Maps the pipeline lifecycle onto the feed states. The
 * split on `parkedReason` is load-bearing: approval-parked runs keep reading as
 * `awaiting-approval` (the gate UI), retries-parked runs surface as first-class
 * `parked` (the resume-with-note queue).
 */
export function pipelineRunToView(r: PipelineRun): RunView {
  const status: FeedStatus =
    r.status === "paused-limit"
      ? "paused-limit"
      : r.status === "parked"
        ? r.parkedReason === "retries" || r.parkedReason === "limit"
          ? "parked"
          : "awaiting-approval"
        : r.status === "failed"
          ? "error"
          : r.status === "done"
            ? "done"
            : "running";
  return {
    runId: r.pipelineRunId,
    kind: "pipeline",
    owner: r.pipelineId,
    status,
    pct: null,
    title: "",
    prompt: r.currentStage ? `fáze: ${r.currentStage}` : "",
    project: r.cwd.split("/").pop() ?? "",
    startedAt: r.startedAt,
    logBase: null,
    taskId: r.taskId,
    parked: r.parked,
    resumeAt: r.resumeAt,
    limitResumeCycles: r.limitResumeCycles,
  };
}

/**
 * Fold the originating task record (title + written-back outcome) into a run
 * view. Dispatched tasks stay hidden as separate feed rows — the run row is the
 * canonical card — so this is where their data surfaces.
 */
export function enrichRunWithTask(
  run: RunView,
  tasksById: ReadonlyMap<string, ScheduledTask>,
): RunView {
  if (!run.taskId) return run;
  const task = tasksById.get(run.taskId);
  if (!task) return run;
  return {
    ...run,
    taskTitle: task.title || task.text,
    taskOutcome: task.outcome?.status,
  };
}

/**
 * Owner id a routed target reads as in the feed: the stored definition's id, or
 * the reserved orchestrator id for the synthetic fallback target (which has none).
 */
function targetOwner(target: TaskTarget | undefined): string {
  if (!target) return "";
  return target.kind === "orchestrator" ? ORCHESTRATOR_ID : target.id;
}

/**
 * Scheduled task → view, or null for `dispatched` (its run is already in the feed
 * via the run lists — including it again would duplicate the task). `cancelled`
 * reads as `interrupted`, a failed dispatch as `error`.
 */
export function scheduledTaskToView(t: ScheduledTask): RunView | null {
  if (t.status === "dispatched") return null;
  const status: FeedStatus =
    t.status === "scheduled"
      ? "scheduled"
      : t.status === "queued"
        ? "queued"
        : t.status === "held"
          ? "held"
          : t.status === "cancelled"
            ? "interrupted"
            : "error";
  return {
    runId: t.id,
    kind: "scheduled",
    owner: targetOwner(t.target),
    status,
    pct: null,
    title: t.title,
    prompt: t.text,
    project: "",
    startedAt: new Date(t.scheduledAt).toISOString(),
    logBase: null,
    projectId: t.projectId,
    heldReason: t.heldReason,
    approvalId: t.approvalId,
    deferredLimit: t.deferredReason === "limit",
  };
}

export interface RunStateMeta {
  /** i18n key suffix under `runs.state.*`. */
  key: FeedStatus;
  badge: TagTone;
  dot: DotTone;
  glyph: IconName;
  pulse: boolean;
}

export const RUN_STATE: Record<FeedStatus, RunStateMeta> = {
  scheduled: {
    key: "scheduled",
    badge: "neutral",
    dot: "idle",
    glyph: "clock",
    pulse: false,
  },
  running: {
    key: "running",
    badge: "run",
    dot: "run",
    glyph: "run",
    pulse: true,
  },
  "awaiting-approval": {
    key: "awaiting-approval",
    badge: "warn",
    dot: "wait",
    glyph: "wait",
    pulse: true,
  },
  done: { key: "done", badge: "ok", dot: "ok", glyph: "ok", pulse: false },
  error: {
    key: "error",
    badge: "bad",
    dot: "bad",
    glyph: "warn",
    pulse: false,
  },
  interrupted: {
    key: "interrupted",
    badge: "neutral",
    dot: "idle",
    glyph: "stop",
    pulse: false,
  },
  parked: {
    key: "parked",
    badge: "warn",
    dot: "wait",
    glyph: "wait",
    pulse: false,
  },
  "paused-limit": {
    key: "paused-limit",
    badge: "neutral",
    dot: "wait",
    glyph: "pause",
    pulse: false,
  },
  held: {
    key: "held",
    badge: "warn",
    dot: "wait",
    glyph: "pause",
    pulse: false,
  },
  queued: {
    key: "queued",
    badge: "neutral",
    dot: "idle",
    glyph: "clock",
    pulse: false,
  },
};

const KIND_GLYPH: Record<RunKind, IconName> = {
  agent: "bot",
  pipeline: "flow",
  scheduled: "clock",
};

/** Resolve a run's display glyph from the catalog (agent), else by kind. */
export function runGlyph(
  run: RunView,
  glyphById: Map<string, IconName>,
): IconName {
  return glyphById.get(run.owner) ?? KIND_GLYPH[run.kind];
}
