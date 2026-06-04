import type { AgentRun, PipelineRun, RunStatus, SkillRun } from "@zibby/contracts";
import type { BadgeTone, DotTone, IconName } from "@zibby/design-system";

/**
 * The Runs screen shows a single feed across run kinds, but the contract has no
 * unified runs list (each kind has its own `…/running`) and no `name`/`glyph`/
 * `cost`/`elapsed`. So we merge the per-kind lists client-side into this view
 * model, deriving the missing display fields (see DESIGN_VS_API_NOTES.md).
 */
export type RunKind = "skill" | "agent" | "pipeline";

export interface RunView {
  runId: string;
  kind: RunKind;
  /** The owning skill/agent/pipeline id (the run's display name). */
  owner: string;
  status: RunStatus;
  /** 0–100, or null for pipeline runs (no single percentage). */
  pct: number | null;
  prompt: string;
  project: string;
  startedAt: string;
  /** Log endpoint base — null for pipeline runs (no single log). */
  logBase: "agents" | "skills" | null;
}

export function skillRunToView(r: SkillRun): RunView {
  return {
    runId: r.runId,
    kind: "skill",
    owner: r.skillId,
    status: r.status,
    pct: r.pct,
    prompt: r.prompt,
    project: r.project,
    startedAt: r.startedAt,
    logBase: "skills",
  };
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
  badge: BadgeTone;
  dot: DotTone;
  glyph: IconName;
  pulse: boolean;
}

export const RUN_STATE: Record<RunStatus, RunStateMeta> = {
  running: { key: "running", badge: "run", dot: "run", glyph: "run", pulse: true },
  "awaiting-approval": { key: "awaiting-approval", badge: "warn", dot: "warn", glyph: "wait", pulse: true },
  done: { key: "done", badge: "ok", dot: "ok", glyph: "ok", pulse: false },
  error: { key: "error", badge: "bad", dot: "bad", glyph: "warn", pulse: false },
  interrupted: { key: "interrupted", badge: "neutral", dot: "faint", glyph: "stop", pulse: false },
};

const KIND_GLYPH: Record<RunKind, IconName> = { skill: "spark", agent: "bot", pipeline: "flow" };

/** Resolve a run's display glyph from the catalog (skill/agent), else by kind. */
export function runGlyph(run: RunView, glyphById: Map<string, IconName>): IconName {
  return glyphById.get(run.owner) ?? KIND_GLYPH[run.kind];
}

/** Human relative time like "před 3 m" / "3 m ago" — coarse, for the feed. */
export function relativeTime(iso: string, now: number, ago: (n: number, unit: string) => string): string {
  const diffMs = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return ago(0, "m");
  if (min < 60) return ago(min, "m");
  const h = Math.floor(min / 60);
  return ago(h, "h");
}
