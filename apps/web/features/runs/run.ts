import type {
  AgentRun,
  PipelineRun,
  RunStatus,
  ScheduledTask,
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

/** Feed status: the shared run states plus the not-yet-fired `scheduled`. */
export type FeedStatus = RunStatus | "scheduled";

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
}

/** Task-first display name: explicit title, else the task text, else the target. */
export function runTitle(run: RunView): string {
  return run.title || run.prompt || run.owner;
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
  };
}

/** Pipeline run → view. Maps the pipeline lifecycle onto the shared run states. */
export function pipelineRunToView(r: PipelineRun): RunView {
  const status: RunStatus =
    r.status === "parked"
      ? "awaiting-approval"
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
  };
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
      : t.status === "cancelled"
        ? "interrupted"
        : "error";
  return {
    runId: t.id,
    kind: "scheduled",
    owner: t.target?.id ?? "",
    status,
    pct: null,
    title: t.title,
    prompt: t.text,
    project: "",
    startedAt: new Date(t.scheduledAt).toISOString(),
    logBase: null,
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
