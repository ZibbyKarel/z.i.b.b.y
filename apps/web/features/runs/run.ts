import type { AgentRun, PipelineRun, RunStatus } from "@zibby/contracts";
import type { ChipTone, DotTone, IconName } from "@zibby/design-system";

/**
 * The Runs screen shows a single feed across run kinds, but the contract has no
 * unified runs list (each kind has its own `…/running`) and no `name`/`glyph`/
 * `cost`/`elapsed`. So we merge the per-kind lists client-side into this view
 * model, deriving the missing display fields (see DESIGN_VS_API_NOTES.md).
 * (Only agents and pipelines are runnable — a skill is a capability an agent
 * invokes, not a standalone run.)
 */
export type RunKind = "agent" | "pipeline";

export interface RunView {
  runId: string;
  kind: RunKind;
  /** The owning agent/pipeline id (the run's display name). */
  owner: string;
  status: RunStatus;
  /** 0–100, or null for pipeline runs (no single percentage). */
  pct: number | null;
  prompt: string;
  project: string;
  startedAt: string;
  /** Log endpoint base — null for pipeline runs (no single log). */
  logBase: "agents" | null;
}

export function agentRunToView(r: AgentRun): RunView {
  return {
    runId: r.runId,
    kind: "agent",
    owner: r.agentId,
    status: r.status,
    pct: r.pct,
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
    prompt: r.currentStage ? `fáze: ${r.currentStage}` : "",
    project: r.cwd.split("/").pop() ?? "",
    startedAt: r.startedAt,
    logBase: null,
  };
}

export interface RunStateMeta {
  /** i18n key suffix under `runs.state.*`. */
  key: RunStatus;
  badge: ChipTone;
  dot: DotTone;
  glyph: IconName;
  pulse: boolean;
}

export const RUN_STATE: Record<RunStatus, RunStateMeta> = {
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
};

/** Resolve a run's display glyph from the catalog (agent), else by kind. */
export function runGlyph(
  run: RunView,
  glyphById: Map<string, IconName>,
): IconName {
  return glyphById.get(run.owner) ?? KIND_GLYPH[run.kind];
}
