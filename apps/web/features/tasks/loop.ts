import type { CreateGoalInput, ProposedGoal } from "@zibby/contracts";
import { slug } from "../../utils/slug";

/** The two kinds of work a loop iteration can run — an agent or a whole workflow. */
export type MakerKind = "agent" | "workflow";

/** The Loop tab's controlled form state, lifted into the dialog. */
export interface LoopFormState {
  /** The outcome the loop drives toward (the human goal statement). */
  objective: string;
  /** The maker selection, encoded as `"<kind>:<id>"` for a single Select. */
  maker: string;
  /** Agent id of the Claude reviewer that judges each iteration. */
  reviewer: string;
  /** Hard fuse: the loop parks after this many verified iterations. */
  maxIterations: string;
  /** Extra standing instructions handed to each maker iteration (optional in the UI). */
  instructions: string;
}

/** A fresh Loop form: empty objective, sensible defaults for everything else. */
export const INITIAL_LOOP_STATE: LoopFormState = {
  objective: "",
  maker: "",
  reviewer: "",
  maxIterations: "5",
  instructions: "",
};

/**
 * Phase 11: seed the Loop form (the "Edit" disclosure) from the classifier's
 * synthesized {@link ProposedGoal}. Lossless with {@link buildCreateGoalBody}: an
 * unedited submit reproduces the same goal the preview implied — encode the maker,
 * map the reviewer, stringify the iteration cap. The dialog re-seeds this
 * whenever a fresh proposal arrives and the operator hasn't manually edited it.
 */
export function proposedGoalToLoopState(goal: ProposedGoal): LoopFormState {
  return {
    objective: goal.objective,
    maker: encodeMaker(goal.maker.kind, goal.maker.id),
    reviewer: goal.verifier.agent,
    maxIterations: String(goal.maxIterations),
    instructions: goal.instructions,
  };
}

const MAKER_SEP = ":";

/** Encode a maker choice into the single Select value `"<kind>:<id>"`. */
export function encodeMaker(kind: MakerKind, id: string): string {
  return `${kind}${MAKER_SEP}${id}`;
}

/** Decode a `"<kind>:<id>"` Select value back into a maker ref, or null if malformed. */
export function decodeMaker(value: string): { kind: MakerKind; id: string } | null {
  const sep = value.indexOf(MAKER_SEP);
  if (sep <= 0) return null;
  const kind = value.slice(0, sep);
  const id = value.slice(sep + 1);
  if ((kind !== "agent" && kind !== "workflow") || id.length === 0) return null;
  return { kind, id };
}

/**
 * Turn arbitrary text into a filename-safe, lowercase-kebab goal id seed.
 * `AgentIdSchema` caps ids at 128 chars; we leave room for the uniqueness suffix.
 */
export function slugify(input: string): string {
  return slug(input, { maxLength: 64 });
}

/**
 * Derive a unique goal id from a human seed plus a timestamp. Goals are file-backed
 * (`<id>.goal.md`), so the id must be unique and filename-safe; the base-36 time
 * suffix keeps repeated submissions from colliding.
 */
export function makeGoalId(seed: string, nowMs: number): string {
  const slug = slugify(seed) || "loop";
  return `${slug}-${nowMs.toString(36)}`;
}

/** Whether the current Loop form can be submitted (mirrors the contract's required fields). */
export function canSubmitLoop(state: LoopFormState): boolean {
  if (state.objective.trim().length < 3) return false;
  if (decodeMaker(state.maker) === null) return false;
  if (state.reviewer.length === 0) return false;
  const iterations = Number(state.maxIterations);
  return Number.isInteger(iterations) && iterations > 0;
}

/**
 * Assemble the `POST /api/goals` body from the Loop form. Assumes `canSubmitLoop`
 * already passed — `decodeMaker` is non-null and the objective is present.
 */
export function buildCreateGoalBody(
  state: LoopFormState,
  goalId: string,
  title: string,
): CreateGoalInput {
  const maker = decodeMaker(state.maker);
  if (!maker) throw new Error("buildCreateGoalBody called with invalid maker");

  const objective = state.objective.trim();

  return {
    id: goalId,
    name: title.trim() || undefined,
    objective,
    maker,
    verifier: { kind: "claude", agent: state.reviewer },
    maxIterations: Number(state.maxIterations),
    // `instructions` is required (min 1) — fall back to the objective when the
    // operator leaves the extra-instructions field empty.
    instructions: state.instructions.trim() || objective,
  };
}
