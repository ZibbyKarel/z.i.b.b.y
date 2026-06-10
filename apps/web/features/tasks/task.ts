import type {
  TaskRouting as ApiTaskRouting,
  TaskTarget as ApiTaskTarget,
} from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";

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

/** A candidate destination for a task — a single agent or a whole pipeline. */
export type TaskTargetKind = "agent" | "pipeline";

export interface TaskTarget {
  kind: TaskTargetKind;
  /** Filesystem-safe id (doubles as the on-disk definition name). */
  id: string;
  /** Display name. */
  name: string;
  glyph: IconName;
  /** Free-form functional area, when the definition carries one. */
  category?: string;
}

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
}

/**
 * Narrow a backend target onto the client shape: the API carries `glyph` as a
 * free-form string (it doesn't know the design-system `IconName` union), so we
 * coerce it here, defaulting to the kind's icon when absent — exactly how the
 * former client-side classifier mapped the raw catalog.
 */
function toClientTarget(target: ApiTaskTarget): TaskTarget {
  return {
    kind: target.kind,
    id: target.id,
    name: target.name,
    glyph: (target.glyph as IconName | undefined) ?? (target.kind === "pipeline" ? "flow" : "bot"),
    category: target.category,
  };
}

/** Map the `POST /api/tasks/classify` response body onto the client routing shape. */
export function toClientRouting(body: ApiTaskRouting): TaskRouting {
  return {
    target: toClientTarget(body.target),
    confidence: body.confidence,
    reason: body.reason,
    matchedTerms: body.matchedTerms,
    candidates: body.candidates.map(toClientTarget),
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
