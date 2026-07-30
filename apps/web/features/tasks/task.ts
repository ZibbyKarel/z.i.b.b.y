import type {
  TaskRouting as ApiTaskRouting,
  TaskTarget as ApiTaskTarget,
  ProposedGoal,
  ResolvedPath,
  SubsystemId,
  TaskMode,
} from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";

export type { SubsystemId };

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

/**
 * A destination for a task — an agent, pipeline, goal, a named subsystem
 * (Phase 91, explicit-only — never emitted by the top-level classifier), or the
 * orchestrator fallback.
 */
export type TaskTargetKind = "agent" | "pipeline" | "goal" | "subsystem" | "orchestrator";

/** A stable key for a target, used to pre-select and dedupe entries in the picker. */
export function targetKey(target: TaskTarget): string {
  return target.kind === "orchestrator" ? "orchestrator" : `${target.kind}:${target.id}`;
}

/**
 * Project a client target onto the wire shape `createTask` accepts (drops nothing).
 * The API's `TaskTarget` is a properly-distributed zod discriminated union (six
 * separate object types); this module's own `TaskTarget` isn't (`kind` is a single
 * unioned property on one shared shape — see the type below), so a generic
 * `{ kind: target.kind, ... }` return infers as ONE object type with a unioned
 * `kind`, which TS stops treating as assignable to the distributed union once
 * there are enough branches (Phase 91 tipped it over). An explicit per-kind
 * `case` — each with a literal `"…" as const` — makes every return statement its
 * own literal-discriminated type, so the inferred return type is the matching
 * distributed union again.
 */
export function toApiTarget(target: TaskTarget) {
  const { name, glyph, category } = target;
  switch (target.kind) {
    case "orchestrator":
      return { kind: "orchestrator" as const, name, glyph, category };
    case "agent":
      return { kind: "agent" as const, id: target.id, name, glyph, category };
    case "pipeline":
      return { kind: "pipeline" as const, id: target.id, name, glyph, category };
    case "goal":
      return { kind: "goal" as const, id: target.id, name, glyph, category };
    case "subsystem":
      return { kind: "subsystem" as const, id: target.id, name, glyph, category };
  }
}

interface TaskTargetDisplay {
  /** Display name. */
  name: string;
  glyph: IconName;
  /** Free-form functional area, when the definition carries one. */
  category?: string;
}

/**
 * Mirrors the contract's discriminated union: agents/pipelines/goals carry
 * the filesystem-safe `id` of their stored definition, a subsystem (Phase 91)
 * carries the closed `SubsystemId` enum, and the orchestrator is synthetic (no
 * stored definition, no id) and exists in the UI purely as a name + glyph.
 *
 * Each `kind` is its OWN intersection member (not one shape with a unioned `kind`
 * property) — `TaskTargetDisplay & (A | B | …)` distributes the intersection over
 * the union, so this evaluates to a properly-discriminated 5-member union, exactly
 * like the API's zod `discriminatedUnion`. That distribution matters: a single
 * shape with a *unioned* `kind` stops being assignable to the API's distributed
 * union once there are enough branches (see `toApiTarget`'s doc comment) — Phase
 * 91 (subsystem, the 5th non-orchestrator kind) is what surfaced it.
 */
export type TaskTarget = TaskTargetDisplay &
  (
    | { kind: "agent"; id: string }
    | { kind: "pipeline"; id: string }
    | { kind: "goal"; id: string }
    | { kind: "subsystem"; id: SubsystemId }
    | { kind: "orchestrator" }
  );

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
  /**
   * Phase 109: the classifier's advisory proposal of which of the routed target's
   * `optionalTools` look relevant to this task — rendered as pre-checked, editable
   * checkboxes ({@link ToolGrantsField}). Optional/defaults to empty so a routing
   * built before this field existed (a test fixture, a manually-constructed
   * preview) still type-checks; every real classify response carries an array
   * (possibly empty) per the API's `.default([])`.
   */
  toolGrants?: string[];
  /**
   * NS2 F10: the classifier judged its top two picks too close to separate (or the
   * winner too weak to act on). `target` is still the best available pick — this only
   * says the choice deserves a human glance, which on THIS surface it already gets:
   * the preview renders the doubt and the manual picker sits beside it. Optional for
   * the same reason as `toolGrants` (older fixtures/hand-built previews still type-check).
   */
  ambiguous?: boolean;
  /**
   * NS2 F10: the runner-up that made the verdict ambiguous, so the preview can name
   * the actual choice ("Forge, or Codex?") instead of only flagging unease. `null`
   * when the router named no alternative — then the doubt is "nothing fits", not "these
   * two are tied", and the copy differs accordingly.
   */
  runnerUp?: { target: TaskTarget; confidence: number; reason: string } | null;
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
  subsystem: "grid",
  orchestrator: "compass",
};

export function toClientTarget(target: ApiTaskTarget): TaskTarget {
  const display = {
    name: target.name,
    glyph: (target.glyph as IconName | undefined) ?? KIND_FALLBACK_GLYPH[target.kind],
    category: target.category,
  };
  // A per-kind switch (not a generic `{ kind: target.kind, ... }` return) so each
  // branch's return statement has a LITERAL `kind` — see `toApiTarget`'s doc
  // comment for why a unioned-kind construction stops being assignable once there
  // are enough branches.
  switch (target.kind) {
    case "orchestrator":
      return { kind: "orchestrator", ...display };
    case "agent":
      return { kind: "agent", id: target.id, ...display };
    case "pipeline":
      return { kind: "pipeline", id: target.id, ...display };
    case "goal":
      return { kind: "goal", id: target.id, ...display };
    case "subsystem":
      return { kind: "subsystem", id: target.id, ...display };
  }
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
    toolGrants: body.toolGrants ?? [],
    ambiguous: body.ambiguous ?? false,
    // The runner-up's target is narrowed the same way the winner's is, so the preview
    // can render its `name`/`glyph` from one shape.
    runnerUp: body.runnerUp
      ? {
          target: toClientTarget(body.runnerUp.target),
          confidence: body.runnerUp.confidence,
          reason: body.runnerUp.reason,
        }
      : null,
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
