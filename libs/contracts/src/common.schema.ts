import { z } from "zod";

/**
 * Shared error body for 4xx responses, used across multiple resource contracts
 * (agents, agent-runs, categories). Kept in a cross-domain `common` module rather
 * than any single resource's schema file so no domain has to reach into another's
 * just for the error shape.
 */
export const ErrorSchema = z.object({ message: z.string() });
export type ErrorBody = z.infer<typeof ErrorSchema>;

/**
 * The shared lifecycle states a run can be in, across every run kind (agent,
 * skill, pipeline stage). Two *safe paused states with no live child* — each
 * survives a restart unchanged rather than being reconciled to `interrupted`:
 * - `awaiting-approval` (Phase 3): the runner created an approval and will not
 *   perform the gated action until a decision arrives.
 * - `paused-limit` (Phase 9): the run's child died on a subscription usage limit;
 *   it is a *pause, not a failure* — it does not burn retry budget, carries a
 *   persisted `resumeAt`, and auto-resumes when the window resets. Modeled on
 *   `awaiting-approval` (a stashed spawn spec gives restart survival + respawn).
 */
export const RunStatusSchema = z.enum([
  "running",
  "done",
  "error",
  "interrupted",
  "awaiting-approval",
  "paused-limit",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/**
 * Risk hint carried in agent/skill frontmatter. Display-only from Phase 3.5 on
 * (the gate policy engine decides; `risk` only colours the UI badge).
 */
export const RiskSchema = z.enum(["low", "medium", "high"]);
export type Risk = z.infer<typeof RiskSchema>;

/**
 * The git worktree a run owns (Phase 3.1). A project-targeted run works on its own
 * branch in a dedicated worktree under the run dir, never the operator's main
 * checkout: `branch` is `zibby/<runId>-<slug>`, `path` the worktree directory, and
 * `baseRef` the HEAD it was cut from (the diff base for the PR-gate diffstat).
 * Optional on the run records — a non-git (or projectless) run carries none and
 * falls back to the Phase 2 direct-checkout cwd.
 */
export const WorkspaceSchema = z.object({
  branch: z.string().min(1),
  path: z.string().min(1),
  baseRef: z.string().min(1),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
