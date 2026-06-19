import type { CreateGoalInput, ProposedGoal } from "@zibby/contracts";

/** The two kinds of work a loop iteration can run — an agent or a whole pipeline. */
export type MakerKind = "agent" | "pipeline";

/** How a loop iteration is judged "done": shell checks, or a Claude reviewer agent. */
export type VerifierKind = "checks" | "claude";

/** The Loop tab's controlled form state, lifted into the dialog. */
export interface LoopFormState {
  /** The outcome the loop drives toward (the human goal statement). */
  objective: string;
  /** The maker selection, encoded as `"<kind>:<id>"` for a single Select. */
  maker: string;
  verifierKind: VerifierKind;
  /** Newline-separated shell commands for the `checks` verifier (empty → project default). */
  commands: string;
  /** Agent id that judges each iteration for the `claude` verifier. */
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
  verifierKind: "checks",
  commands: "",
  reviewer: "",
  maxIterations: "5",
  instructions: "",
};

/**
 * Phase 11: seed the Loop form (the "Edit" disclosure) from the classifier's
 * synthesized {@link ProposedGoal}. Lossless with {@link buildCreateGoalBody}: an
 * unedited submit reproduces the same goal the preview implied — encode the maker,
 * map the verifier kind, stringify the iteration cap. The dialog re-seeds this
 * whenever a fresh proposal arrives and the operator hasn't manually edited it.
 */
export function proposedGoalToLoopState(goal: ProposedGoal): LoopFormState {
  return {
    objective: goal.objective,
    maker: encodeMaker(goal.maker.kind, goal.maker.id),
    verifierKind: goal.verifier.kind,
    commands: goal.verifier.kind === "checks" ? (goal.verifier.commands ?? []).join("\n") : "",
    reviewer: goal.verifier.kind === "claude" ? goal.verifier.agent : "",
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
  if ((kind !== "agent" && kind !== "pipeline") || id.length === 0) return null;
  return { kind, id };
}

/**
 * Turn arbitrary text into a filename-safe, lowercase-kebab goal id seed.
 * `AgentIdSchema` caps ids at 128 chars; we leave room for the uniqueness suffix.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
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

/** Split the commands textarea into trimmed, non-empty shell commands. */
export function parseCommands(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Whether the current Loop form can be submitted (mirrors the contract's required fields). */
export function canSubmitLoop(state: LoopFormState): boolean {
  if (state.objective.trim().length < 3) return false;
  if (decodeMaker(state.maker) === null) return false;
  if (state.verifierKind === "claude" && state.reviewer.length === 0) {
    return false;
  }
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
  const commands = parseCommands(state.commands);

  const verifier: CreateGoalInput["verifier"] =
    state.verifierKind === "claude"
      ? { kind: "claude", agent: state.reviewer }
      : { kind: "checks", ...(commands.length > 0 ? { commands } : {}) };

  return {
    id: goalId,
    name: title.trim() || undefined,
    objective,
    maker,
    verifier,
    maxIterations: Number(state.maxIterations),
    // `instructions` is required (min 1) — fall back to the objective when the
    // operator leaves the extra-instructions field empty.
    instructions: state.instructions.trim() || objective,
  };
}
