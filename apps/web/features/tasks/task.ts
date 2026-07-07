import type {
  TaskRouting as ApiTaskRouting,
  TaskTarget as ApiTaskTarget,
  ProposedGoal,
  ResolvedPath,
  TaskMode,
} from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";

export type { ProposedGoal, ResolvedPath, TaskMode };

/**
 * Detects file/folder references inside a free-text task description so they can
 * be surfaced as removable context chips. Matches `~/…`, `./…` and absolute
 * `/…` paths; the absolute form requires a few characters so a lone slash in
 * prose isn't mistaken for a path.
 */
export const TASK_PATH_RE = /(~\/[\w.\-/]+|\.\/[\w.\-/]+|\/[\w.\-/]{5,})/g;

/** Distinct file/folder paths referenced in the task text, in first-seen order. */
export function extractPaths(text: string): string[] {
  const matches = text.match(TASK_PATH_RE) ?? [];
  return [...new Set(matches)];
}

/** A detected path together with its `[start, end)` character span in the source text. */
export interface PathRange {
  path: string;
  start: number;
  end: number;
}

/**
 * Every path occurrence in the text with its character span — used to highlight the
 * paths inline in the composer (each occurrence is marked, so a path written twice
 * lights up twice). Unlike {@link extractPaths} this is positional and not deduped.
 */
export function extractPathRanges(text: string): PathRange[] {
  const ranges: PathRange[] = [];
  for (const match of text.matchAll(TASK_PATH_RE)) {
    if (match.index === undefined) continue;
    ranges.push({ path: match[0], start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

/**
 * The trailing segment of a path — the folder/file name used to derive a granted
 * project's `name`/`id` (Phase 11.3). Strips a trailing slash; "~/Projects/alpha"
 * → "alpha", "/var/log/app" → "app".
 */
export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

/** A destination for a task — an agent, pipeline, goal, chain, or the orchestrator fallback. */
export type TaskTargetKind = "agent" | "pipeline" | "goal" | "chain" | "orchestrator";

/** A stable key for a target, used to pre-select and dedupe entries in the picker. */
export function targetKey(target: TaskTarget): string {
  return target.kind === "orchestrator" ? "orchestrator" : `${target.kind}:${target.id}`;
}

/** Project a client target onto the wire shape `createTask` accepts (drops nothing). */
export function toApiTarget(target: TaskTarget) {
  if (target.kind === "orchestrator") {
    return {
      kind: "orchestrator" as const,
      name: target.name,
      glyph: target.glyph,
      category: target.category,
    };
  }
  return {
    kind: target.kind,
    id: target.id,
    name: target.name,
    glyph: target.glyph,
    category: target.category,
  };
}

interface TaskTargetDisplay {
  /** Display name. */
  name: string;
  glyph: IconName;
  /** Free-form functional area, when the definition carries one. */
  category?: string;
}

/**
 * Mirrors the contract's discriminated union: agents and pipelines carry the
 * filesystem-safe `id` of their stored definition; the orchestrator is synthetic
 * (no stored definition, no id) and exists in the UI purely as a name + glyph.
 */
export type TaskTarget =
  | (TaskTargetDisplay & { kind: "agent" | "pipeline" | "goal" | "chain"; id: string })
  | (TaskTargetDisplay & { kind: "orchestrator" });

/**
 * The classifier verdict the approval gate renders: the chosen target, a 0–1
 * confidence, the catalog terms that drove the match (the human-readable
 * "reason"), and every candidate so the user can override.
 */
export interface TaskRouting {
  target: TaskTarget;
  /** 0–1; low values steer the user toward the manual picker. */
  confidence: number;
  /** One short human sentence explaining the choice (from the backend router). */
  reason: string;
  /** Catalog terms that matched the description — the routing rationale. */
  matchedTerms: string[];
  candidates: TaskTarget[];
  /** Phase 11: execute as a one-shot dispatch (`single`) or a synthesized `loop`. */
  mode: TaskMode;
  /** Phase 11: the synthesized goal proposal when `mode === "loop"`, else `null`. */
  proposedGoal: ProposedGoal | null;
  /** Phase 11: detected paths resolved against the project registry (scoped vs grant). */
  paths: ResolvedPath[];
}

/**
 * Narrow a backend target onto the client shape: the API carries `glyph` as a
 * free-form string (it doesn't know the design-system `IconName` union), so we
 * coerce it here, defaulting to the kind's icon when absent — exactly how the
 * former client-side classifier mapped the raw catalog. Exported (Phase 38) so a
 * caller holding the wider `@zibby/contracts` `TaskTarget` — e.g. `ChatScreen`
 * feeding a palette-picked target into `CommandLine`'s `injectedTarget` — can
 * narrow it onto this module's `TaskTarget` before handing it over.
 */
const KIND_FALLBACK_GLYPH: Record<TaskTargetKind, IconName> = {
  agent: "bot",
  pipeline: "flow",
  goal: "retry",
  chain: "link",
  orchestrator: "compass",
};

export function toClientTarget(target: ApiTaskTarget): TaskTarget {
  const display = {
    name: target.name,
    glyph: (target.glyph as IconName | undefined) ?? KIND_FALLBACK_GLYPH[target.kind],
    category: target.category,
  };
  if (target.kind === "orchestrator") return { kind: "orchestrator", ...display };
  return { kind: target.kind, id: target.id, ...display };
}

/** Map the `POST /api/tasks/classify` response body onto the client routing shape. */
export function toClientRouting(body: ApiTaskRouting): TaskRouting {
  return {
    target: toClientTarget(body.target),
    confidence: body.confidence,
    reason: body.reason,
    matchedTerms: body.matchedTerms,
    candidates: body.candidates.map(toClientTarget),
    mode: body.mode,
    proposedGoal: body.proposedGoal,
    paths: body.paths,
  };
}

export type ConfidenceBand = "high" | "medium" | "low";

/** Buckets a raw confidence into the bands the meter and copy switch on. */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.66) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

/** True when the result is too weak to dispatch blindly — nudge to manual pick. */
export function isLowConfidence(confidence: number): boolean {
  return confidenceBand(confidence) === "low";
}

// ── Delayed start ──────────────────────────────────────────────────────────

/** The delayed-start presets the New Task dialog offers (custom time is out of scope). */
export type SchedulePreset = "now" | "in-1h" | "limit-reset";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Resolve a preset to an absolute `scheduledAt` epoch ms — or `null` for "run now".
 * "limit-reset" needs the limits' reset time (`resetsAt`); when that is unknown or
 * already past it falls back to running now, so a stale limits read never strands a
 * task in the future.
 */
export function resolveScheduledAt(
  preset: SchedulePreset,
  now: number,
  resetsAt: number | null,
): number | null {
  switch (preset) {
    case "now":
      return null;
    case "in-1h":
      return now + ONE_HOUR_MS;
    case "limit-reset":
      return resetsAt !== null && resetsAt > now ? resetsAt : null;
  }
}

/** A zero-padded `HH:MM` clock for a timestamp (local time). */
export function clockLabel(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * A short human "when" for a scheduled time: just `HH:MM` if it's today, else
 * `DD.MM. HH:MM`. Wrapped by the dialog's "runs at {when}" copy.
 */
export function whenLabel(ts: number, now: number): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date(now).toDateString();
  const time = clockLabel(ts);
  if (sameDay) return time;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}. ${time}`;
}
