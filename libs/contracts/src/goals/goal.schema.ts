import { z } from "zod";
import { AgentIdSchema, AgentModelSchema, AgentThinkingSchema } from "../agents/agent.schema";
import { ProjectBudgetSchema } from "../projects/project.schema";

/**
 * The maker a goal iterates: an existing stored agent OR pipeline, dispatched
 * through the same runner seam everything else uses (Phase 10 is thin glue — the
 * maker is NOT a new run kind). `id` is the agent/pipeline definition id.
 */
export const MakerRefSchema = z.object({
  kind: z.enum(["agent", "pipeline"]),
  id: AgentIdSchema,
});
export type MakerRef = z.infer<typeof MakerRefSchema>;

/**
 * How a goal's verifier decides "satisfied" — a spec, not a new engine:
 * - `checks`: deterministic shell commands (the Phase 2.1 verify-stage assembly,
 *   lifted into `buildVerifyCommand`). `commands` overrides; absent falls back to
 *   the project's `checks`. Exit 0 → satisfied. No model, no tokens. NOTE: for
 *   GOALS the runner refuses to fall through to the full-repo `DEFAULT_VERIFY_CHECKS`
 *   and to run with cwd inside the repo — a `checks` verifier with neither commands
 *   nor a project's checks (or no worktree/project to run in) parks the goal with
 *   `verifier-scope` (Phase 12.1/12.2). The pipeline verify stage is unaffected.
 * - `claude`: a fresh agent run on its own (cheaper) model, handed the maker's
 *   diff/output, that returns a verdict. A separate spawn with no shared session
 *   (no session resume exists — decision 8).
 */
export const VerifierSpecSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("checks"),
    commands: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    kind: z.literal("claude"),
    agent: AgentIdSchema,
    model: AgentModelSchema.optional(),
    thinking: AgentThinkingSchema.optional(),
  }),
]);
export type VerifierSpec = z.infer<typeof VerifierSpecSchema>;

/** The plain object form — `update` derives from this. */
const GoalObject = z.object({
  id: AgentIdSchema,
  name: z.string().min(1).optional(),
  desc: z.string().optional(),
  /** The outcome the loop is driving toward — the human goal statement. */
  objective: z.string().min(1),
  maker: MakerRefSchema,
  verifier: VerifierSpecSchema,
  /** The hard fuse: the loop parks after this many *counted* (verified) iterations. */
  maxIterations: z.number().int().positive(),
  /** Per-goal run-count budget (mirrors a project's), optional. */
  budget: ProjectBudgetSchema.optional(),
  /** Markdown body — extra standing instructions handed to each maker iteration. */
  instructions: z.string().min(1),
});

/**
 * A goal definition — the outer loop's recipe — stored as a `.goal.md` file
 * (frontmatter carries `maker`/`verifier`/`maxIterations`/`budget`, the Markdown
 * body is `instructions`). A parallel to a pipeline definition, not a new dispatch
 * path: the maker it names is an existing agent or pipeline.
 */
export const GoalSchema = GoalObject;
export type Goal = z.infer<typeof GoalSchema>;

/** Body accepted by `createGoal` — the full entity (`id` + required fields). */
export const CreateGoalSchema = GoalSchema;
export type CreateGoalInput = z.infer<typeof CreateGoalSchema>;

/** Body accepted by `updateGoal` — every field optional (partial), id excluded. */
export const UpdateGoalSchema = GoalObject.omit({ id: true }).partial();
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>;
