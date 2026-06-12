import { z } from "zod"
import { AgentIdSchema } from "../agents/agent.schema"

/**
 * A project's `id` doubles as the registry key and travels in a URL path param
 * (`DELETE /projects/:id`), so it reuses the agent id rules: filename-safe,
 * no path separators or traversal. The web app slugifies the free-form name
 * into this shape before creating, exactly as agents do.
 */
export const ProjectIdSchema = AgentIdSchema

/**
 * Per-engagement budget (Phase 8.1). The unit is **run-count per window**, not
 * tokens: a run carries no usage data and `LimitsService` is account-level, so a
 * per-project token cap would be a lie in the UI. `maxConcurrent` is the
 * parallelism cap (8.2) — at capacity new dispatches QUEUE, they are not rejected.
 * Every field optional (absent = unlimited on that axis); `.strict()` so an unknown
 * key can never smuggle a fourth knob in. Windows are calendar day / ISO week in
 * Europe/Prague (the scheduler's cron timezone).
 */
export const ProjectBudgetSchema = z
  .object({
    dailyRuns: z.number().int().positive().optional(),
    weeklyRuns: z.number().int().positive().optional(),
    maxConcurrent: z.number().int().positive().optional(),
  })
  .strict()
export type ProjectBudget = z.infer<typeof ProjectBudgetSchema>

/**
 * A target directory agents and skills can run against — the catalog of run
 * destinations the RunModal offers (instead of a hard-coded list). Projects live
 * in a registry the backend owns (`_projects.json`), not as files on disk, so
 * deleting a project removes only the registry record; the files it points at
 * are untouched. `category` links to the project taxonomy by name (free-form, the
 * closed set lives in the web app) and `path` is the root on the host system.
 */
export const ProjectSchema = z.object({
  id: ProjectIdSchema,
  name: z.string().min(1),
  path: z.string().min(1),
  desc: z.string().optional(),
  category: z.string().optional(),
  /**
   * Shell commands a pipeline verify phase runs against this project (in
   * `path`), joined with `&&`. Absent → the shared default checks apply.
   */
  checks: z.array(z.string().min(1)).optional(),
  /** Per-engagement run-count budget + concurrency cap (Phase 8.1). */
  budget: ProjectBudgetSchema.optional(),
})
export type Project = z.infer<typeof ProjectSchema>

/** Body accepted by `createProject` — the full entity (`id` + `name` + `path` required). */
export const CreateProjectSchema = ProjectSchema
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>

/** Body accepted by `updateProject` — every field optional (partial update), id excluded. */
export const UpdateProjectSchema = ProjectSchema.omit({ id: true }).partial()
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
