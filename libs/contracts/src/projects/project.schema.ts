import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { AgentIdSchema } from "../agents/agent.schema";

/**
 * A project's `id` doubles as the registry key and travels in a URL path param
 * (`DELETE /projects/:id`), so it reuses the agent id rules: filename-safe,
 * no path separators or traversal. The web app slugifies the free-form name
 * into this shape before creating, exactly as agents do.
 */
export const ProjectIdSchema = AgentIdSchema;

/** A person associated with a project (team member, client contact, stakeholder). */
export const ProjectPersonSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  /** VIP flag: forces Tier-3 escalation for messages from this person. */
  vip: z.boolean().optional(),
  /** Preferred communication style hint for drafted replies. */
  comms_style: z.string().optional(),
});
export type ProjectPerson = z.infer<typeof ProjectPersonSchema>;

/** People associated with the project: team, clients, stakeholders. */
export const ProjectIdentitySchema = z.object({
  people: z.array(ProjectPersonSchema).optional(),
});
export type ProjectIdentity = z.infer<typeof ProjectIdentitySchema>;

/**
 * Per-project autonomy policy. Can only **harden** the global floor (tighten rules)
 * — the gate engine enforces 422 on any attempt to relax a floor rule.
 */
export const ProjectAutonomyPolicySchema = z.object({
  /** Action verbs ZIBBY may perform without asking (e.g. "reply", "create_task"). */
  can_do_alone: z.array(z.string()).optional(),
  /** Action verbs that always require operator approval in this project. */
  always_ask: z.array(z.string()).optional(),
  /** When true, any message from a VIP person forces Tier-3 escalation. */
  vip_escalation: z.boolean().optional(),
  /** autonomous = act on tier policy; draft_only = always draft, never send. */
  respond_as: z.enum(["autonomous", "draft_only"]).optional(),
});
export type ProjectAutonomyPolicy = z.infer<typeof ProjectAutonomyPolicySchema>;

/** Daily operational rhythm for the project. */
export const ProjectDailyRhythmSchema = z.object({
  /** HH:MM time for the standup cheat-sheet cron (Europe/Prague). */
  standup_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "must be HH:MM")
    .optional(),
  /** Standup format description or template. */
  format: z.string().optional(),
  /** Active monitoring window, e.g. "09:00-18:00". */
  active_hours: z.string().optional(),
});
export type ProjectDailyRhythm = z.infer<typeof ProjectDailyRhythmSchema>;

/**
 * The operational profile of a project — who is involved, what ZIBBY may do
 * autonomously, and when the operator expects to be active. Nested inside the
 * full Project entity as optional fields.
 */
export const ProjectProfileSchema = z.object({
  identity: ProjectIdentitySchema.optional(),
  autonomy_policy: ProjectAutonomyPolicySchema.optional(),
  daily_rhythm: ProjectDailyRhythmSchema.optional(),
});
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;

/** Body accepted by `updateProjectProfile` — all profile fields optional. */
export const UpdateProjectProfileSchema = ProjectProfileSchema.partial();
export type UpdateProjectProfileInput = z.infer<typeof UpdateProjectProfileSchema>;

/**
 * Per-engagement budget (Phase 8.1, dollar caps added Phase 12). The unit is
 * **run-count per window** OR **USD per window** — both axes optional and
 * independent, a project may set either, both, or neither. `maxConcurrent` is the
 * parallelism cap (8.2) — at capacity new dispatches QUEUE, they are not rejected.
 * Every field optional (absent = unlimited on that axis); `.strict()` so an unknown
 * key can never smuggle a fifth knob in. Windows are calendar day / ISO week /
 * calendar month in Europe/Prague (the scheduler's cron timezone).
 */
export const ProjectBudgetSchema = z
  .object({
    dailyRuns: z.number().int().positive().optional(),
    weeklyRuns: z.number().int().positive().optional(),
    // M7: the north-star's "monthly cap" — same run-count unit as daily/weekly,
    // cut on the Europe/Prague calendar month.
    monthlyRuns: z.number().int().positive().optional(),
    maxConcurrent: z.number().int().positive().optional(),
    /**
     * Phase 12: dollar caps, same windows as the run-count caps above but priced
     * off the accumulated `costUsd` of finished runs (`BudgetLedgerStore`'s `"cost"`
     * lines) rather than a run count. `spend-past-cap` holds a dispatch whose
     * spent-so-far + estimated next-run cost would cross the cap.
     */
    dailyCostCapUsd: z.number().positive().optional(),
    weeklyCostCapUsd: z.number().positive().optional(),
    monthlyCostCapUsd: z.number().positive().optional(),
  })
  .strict();
export type ProjectBudget = z.infer<typeof ProjectBudgetSchema>;

/**
 * A target directory agents and skills can run against — the catalog of run
 * destinations the RunModal offers (instead of a hard-coded list). Projects live
 * in a registry the backend owns (`_projects.json`), not as files on disk, so
 * deleting a project removes only the registry record; the files it points at
 * are untouched. `category` links to the project taxonomy by name (free-form, the
 * closed set lives in the web app) and `path` is the root on the host system.
 *
 * The operational profile fields (`identity`, `autonomy_policy`, `daily_rhythm`)
 * are also stored in the registry and mirrored to a vault note so agents can
 * ground on the project context.
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

  /**
   * Optional custom logo as a data URI (`data:image/*;base64,…`), shown on the
   * project card in place of the default glyph (the glyph remains the fallback
   * when absent, or when the image fails to load). Capped at ~200 KB of base64
   * (280 000 chars) to bound the cost of reading it back on every `GET /projects`.
   */
  logo: z.string().startsWith("data:image/").max(280_000).optional(),

  // --- Operational profile (M1) ---
  /** Team members, clients, and stakeholders associated with this project. */
  identity: ProjectIdentitySchema.optional(),
  /** Per-project autonomy policy (can only harden the global gate floor). */
  autonomy_policy: ProjectAutonomyPolicySchema.optional(),
  /** Daily operational rhythm: standup timing, monitoring hours. */
  daily_rhythm: ProjectDailyRhythmSchema.optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Body accepted by `createProject` — the full entity (`id` + `name` + `path` required). */
export const CreateProjectSchema = ProjectSchema.omit({ hasSecrets: true });
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

/** Body accepted by `updateProject` — every field optional (partial update), id + hasSecrets excluded. */
export const UpdateProjectSchema = ProjectSchema.omit({ id: true, hasSecrets: true }).partial();
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

/**
 * Write-only secrets body — secret environment variables injected into this
 * project's runs. A flat string map; never readable over HTTP (no read endpoint;
 * the entity exposes only `hasSecrets`).
 */
export const ProjectSecretsInputSchema = z.record(z.string(), z.string());
export type ProjectSecretsInput = z.infer<typeof ProjectSecretsInputSchema>;

/** A standup cheat sheet generated for a project from the past 24 h of activity. */
export const ProjectStandupSchema = z.object({
  projectId: z.string(),
  date: z.string(),
  generatedAt: IsoDateTimeSchema,
  text: z.string(),
});
export type ProjectStandup = z.infer<typeof ProjectStandupSchema>;
