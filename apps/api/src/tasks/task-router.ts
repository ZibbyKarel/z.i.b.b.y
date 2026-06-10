import type { ClassifyTaskInput, TaskRouting, TaskTarget } from "@zibby/contracts"

/**
 * A routable destination: a {@link TaskTarget} plus the free-text catalog blob
 * (`search`) used to score and describe it (name, id, category, description /
 * pipeline desc + phase agents). The contract response carries only the plain
 * {@link TaskTarget}, so {@link toTaskTarget} strips the internal `search`.
 */
export interface RoutableTarget extends TaskTarget {
  search: string
}

/** Project a routable candidate down to the contract's wire shape (drops `search`). */
export function toTaskTarget(candidate: RoutableTarget): TaskTarget {
  return {
    kind: candidate.kind,
    id: candidate.id,
    name: candidate.name,
    glyph: candidate.glyph,
    category: candidate.category,
  }
}

/**
 * Picks the best target for a task from a pre-built candidate list. Two
 * implementations share this seam: the `claude -p` router (the AI categorizer)
 * and the deterministic keyword scorer (the always-available fallback). The
 * classifier service swaps them behind the {@link TASK_ROUTER} token.
 *
 * Returns `null` when it can't produce a confident, well-formed verdict — the
 * service then falls back to the keyword scorer (which never returns null).
 */
export interface TaskRouter {
  route(input: ClassifyTaskInput, candidates: RoutableTarget[]): Promise<TaskRouting | null>
}

/** DI token for the primary {@link TaskRouter} (the LLM router in production). */
export const TASK_ROUTER = Symbol("TASK_ROUTER")
