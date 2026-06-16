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
  /**
   * Non-secret environment variables injected into this project's runs (the
   * `claude -p` process). For values that ARE secret (API keys, DB URLs), use the
   * separate write-only secrets store — they never live on the committed entity.
   */
  env: z.record(z.string(), z.string()).optional(),
  /**
   * Computed at read time: whether a secrets file exists. Optional (not defaulted)
   * so the many synthetic `Project` literals across the codebase need not set it;
   * the controller always layers the real value onto wire responses.
   */
  hasSecrets: z.boolean().optional(),
})
export type Project = z.infer<typeof ProjectSchema>

/** Body accepted by `createProject` — the full entity (`id` + `name` + `path` required). */
export const CreateProjectSchema = ProjectSchema.omit({ hasSecrets: true })
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>

/** Body accepted by `updateProject` — every field optional (partial update), id + hasSecrets excluded. */
export const UpdateProjectSchema = ProjectSchema.omit({ id: true, hasSecrets: true }).partial()
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>

/**
 * Write-only secrets body — secret environment variables injected into this
 * project's runs. A flat string map; never readable over HTTP (no read endpoint;
 * the entity exposes only `hasSecrets`).
 */
export const ProjectSecretsInputSchema = z.record(z.string(), z.string())
export type ProjectSecretsInput = z.infer<typeof ProjectSecretsInputSchema>

// ─── Project Profile schemas (M1) ───────────────────────────────────────────
// Profile lives ONLY in vault/projects/<id>.md — NOT in ProjectSchema/registry.

/** A person on the project team. VIP status raises autonomy escalation threshold. */
export const PersonSchema = z
  .object({
    name: z.string().min(1),
    role: z.string().min(1).optional(),
    vip: z.boolean().default(false),
    /** Preferred communication style (e.g. "concise Slack DMs"). */
    commsStyle: z.string().optional(),
  })
  .strict()
export type Person = z.infer<typeof PersonSchema>

export const IdentitySchema = z
  .object({
    people: z.array(PersonSchema).default([]),
  })
  .strict()
export type Identity = z.infer<typeof IdentitySchema>

/**
 * How ZIBBY should compose responses for this project.
 * `autonomous` = send directly; `draft_only` = prepare for operator review.
 * Default is `draft_only` (Tier-3 safe; autonomous is opt-in).
 */
export const RespondAsSchema = z.enum(["autonomous", "draft_only"])
export type RespondAs = z.infer<typeof RespondAsSchema>

/**
 * Per-project autonomy policy. Only `alwaysAsk` has runtime gate effect —
 * it emits `ask:human` rules scoped to this project. `canDoAlone` is
 * declarative/UI documentation of intent; it generates NO `allow` rule
 * (that would relax the floor, which is forbidden).
 */
export const AutonomyPolicySchema = z
  .object({
    /** Actions ZIBBY can perform without asking. Declarative only — no gate enforcement. */
    canDoAlone: z.array(z.string().min(1)).default([]),
    /** Actions that always require human approval for this project (compiled to gate rules). */
    alwaysAsk: z.array(z.string().min(1)).default([]),
    /** Whether VIP team members trigger escalation. */
    vipEscalation: z.boolean().default(false),
    respondAs: RespondAsSchema.default("draft_only"),
  })
  .strict()
export type AutonomyPolicy = z.infer<typeof AutonomyPolicySchema>

/** Daily operating rhythm for the project. */
export const DailyRhythmSchema = z
  .object({
    /** Time of standup in "HH:MM" format (Europe/Prague). */
    standupTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    /** Standup output format / template. */
    format: z.string().optional(),
    activeHours: z
      .object({
        from: z.string().regex(/^\d{2}:\d{2}$/),
        to: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .optional(),
  })
  .strict()
export type DailyRhythm = z.infer<typeof DailyRhythmSchema>

/**
 * The full project profile — persisted as vault/projects/<id>.md frontmatter.
 * Read/written only via GET/PUT /projects/:id/profile.
 * NOT part of ProjectSchema; never flows through PATCH /projects/:id.
 */
export const ProjectProfileSchema = z
  .object({
    identity: IdentitySchema.default({ people: [] }),
    autonomyPolicy: AutonomyPolicySchema.default({}),
    dailyRhythm: DailyRhythmSchema.optional(),
  })
  .strict()
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>
