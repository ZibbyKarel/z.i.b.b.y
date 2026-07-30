import type {
  CatalogTaskTarget,
  ClassifyTaskInput,
  PipelineComplexity,
  TaskRouting,
  TaskTarget,
} from "@zibby/contracts";

/** A named subsystem as a rankable stage-1 verdict (F2a — see {@link RoutableTarget}). */
type SubsystemTaskTarget = Extract<TaskTarget, { kind: "subsystem" }>;

/**
 * A routable destination: a {@link CatalogTaskTarget} (a stored agent or
 * pipeline) or — as of F2a — a named {@link SubsystemTaskTarget} (a whole
 * delegation, resolved to a concrete unit by stage-2 downstream). Never the
 * synthetic orchestrator, which is the classifier's terminal fallback, not a
 * ranked candidate. Plus the free-text catalog blob (`search`) used to score
 * and describe it (name, id, category, description / pipeline desc + phase
 * agents / subsystem mandate). The contract response carries only the plain
 * target, so {@link toTaskTarget} strips the internal `search`.
 */
export type RoutableTarget = (CatalogTaskTarget | SubsystemTaskTarget) & {
  search: string;
  /**
   * NS2 F9 — the candidate's rung on its subsystem's complexity ladder, present
   * only on `kind: "pipeline"` candidates. Agents are the rung BELOW `light` and
   * carry no value; subsystem candidates (stage 1) have no rung at all, because
   * the ladder is a within-subsystem ordering.
   */
  complexity?: PipelineComplexity;
  /**
   * Can this candidate carry work to a PR-shaped code change on its own?
   *
   * True only for a pipeline that DECLARES a `pr` sink in its `outputs:` block —
   * the unit's own statement that it ends in an opened PR, which is a stronger and
   * far more stable signal than inspecting the tool lists of the agents in its
   * phases. Read by `TaskClassifierService.constrainByOutput` to enforce
   * `ClassifyTaskInput.output` structurally.
   *
   * Deliberately absent (falsy) on every AGENT candidate, and that is the whole
   * point rather than an omission: a task that must produce a PR is never routed to
   * a lone agent. The rung that looks like "one implementer agent" already exists as
   * a pipeline — forge's `quick-fix` (light: a single `fullstack-developer` phase
   * plus a declared `pr` output) — so the invariant costs no expressiveness while
   * keeping review, verification and a real sink in the path.
   */
  deliversPr?: boolean;
};

/**
 * Project a routable candidate down to the contract's wire shape (drops
 * `search`). A per-kind switch (not a generic `{ kind: candidate.kind, ... }`
 * return) — each branch's return statement gets a LITERAL `kind`, so the
 * inferred type stays the properly-distributed union instead of collapsing to
 * one shape with a unioned `kind` (which stops being assignable once there are
 * enough branches — the same pitfall documented on the web's `toApiTarget`).
 */
export function toTaskTarget(candidate: RoutableTarget): CatalogTaskTarget | SubsystemTaskTarget {
  const { name, glyph, avatar, category } = candidate;
  switch (candidate.kind) {
    case "subsystem":
      return { kind: "subsystem", id: candidate.id, name, glyph, avatar, category };
    case "agent":
      return { kind: "agent", id: candidate.id, name, glyph, avatar, category };
    case "pipeline":
      return { kind: "pipeline", id: candidate.id, name, glyph, avatar, category };
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
 *
 * F2b: an optional `preamble` — extra context injected ahead of the task text
 * (a subsystem's mandate + owned-unit list, for {@link TaskClassifierService.classifyWithinSubsystem}'s
 * scoped catalog). The LLM router weaves it into its prompt; the keyword
 * scorer has no prompt to inject into, so it accepts and ignores it
 * (signature parity — both implementations of this interface stay swappable).
 */
export interface TaskRouter {
  route(
    input: ClassifyTaskInput,
    candidates: RoutableTarget[],
    preamble?: string,
  ): Promise<TaskRouting | null>;
}

/** DI token for the primary {@link TaskRouter} (the LLM router in production). */
export const TASK_ROUTER = Symbol("TASK_ROUTER");
