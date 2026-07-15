import { z } from "zod";
import { AvatarSchema, IsoDateTimeSchema } from "../common.schema";
import { AgentIdSchema } from "../agents/agent.schema";

/**
 * A project's `id` doubles as the registry key and travels in a URL path param
 * (`DELETE /projects/:id`), so it reuses the agent id rules: filename-safe,
 * no path separators or traversal. The web app slugifies the free-form name
 * into this shape before creating, exactly as agents do.
 */
export const ProjectIdSchema = AgentIdSchema;

/**
 * CVE-2017-1000117 class: reject a remote whose user/host authority segment
 * starts with `-`. Git's ssh transport spawns `ssh` with the host (and, for
 * scp-like/`ssh://` forms, optionally a user) as a POSITIONAL argument; a
 * segment starting with `-` is parsed by ssh as an OPTION
 * (`-oProxyCommand=…`) instead of a host/user, letting an attacker smuggle
 * arbitrary ssh options through what looks like an ordinary remote. The
 * top-level `url.startsWith("-")` guard in {@link isValidGitRemote} below
 * only checks position 0 of the WHOLE string — it misses
 * `git@-oProxyCommand:evil` (the dash lands right after the `@`) and
 * `ssh://-oProxyCommand@host/x` / `ssh://user@-host/x` (the dash lands
 * inside the `ssh://` authority). Applied to both `ssh://` and `https://`
 * authorities (cheap, and a legitimate host never starts with `-`, so no
 * existing fixture is affected).
 *
 * The authority's userinfo/host split is on the LAST `@`, matching how ssh
 * itself parses `user@host` (verified: `ssh -G 'user@evil@host'` resolves
 * host=`host`, not `evil@host`) — a naive split on the FIRST `@` lets a
 * second `@` smuggle a dash-leading host past this check entirely: for
 * `ssh://user@evil@-host/x` a first-`@` split reads host as `evil@-host`
 * (doesn't start with `-` → wrongly accepted) while ssh actually connects to
 * `-host` (a `-`-leading positional arg → option injection). Splitting on
 * `lastIndexOf("@")` closes that: `userinfo` is everything before the last
 * `@`, `host[:port]` is everything after it.
 */
function authorityHasLeadingDash(url: string): boolean {
  let authority: string;
  if (/^https:\/\//i.test(url)) {
    authority = url.slice("https://".length).split(/[/?#]/)[0] ?? "";
  } else if (/^ssh:\/\//i.test(url)) {
    authority = url.slice("ssh://".length).split("/")[0] ?? "";
  } else {
    // scp-like `user@host:path` — the authority is everything before the first ':'.
    const colonIndex = url.indexOf(":");
    authority = colonIndex === -1 ? url : url.slice(0, colonIndex);
  }
  const atIndex = authority.lastIndexOf("@");
  const user = atIndex === -1 ? "" : authority.slice(0, atIndex);
  const hostAndPort = atIndex === -1 ? authority : authority.slice(atIndex + 1);
  const host = hostAndPort.split(":")[0] ?? "";
  return user.startsWith("-") || host.startsWith("-");
}

/**
 * Task 8 — fail-closed allowlist for a git clone remote. The single
 * source-of-truth predicate shared by the `gitRemote` refinement below AND
 * `apps/api/src/shared/git-exec.ts`'s `validateRemote()` (which re-exports
 * this same function) — one definition, not two independently-maintained
 * copies. Lives here (not in `apps/api`) because `libs/contracts` is the
 * dependency-free base layer apps already import; the reverse (contracts
 * importing from an app) would invert that direction and there is no module
 * path for it (no package name / tsconfig alias points from `libs/contracts`
 * at `apps/api`).
 *
 * Accepts only the two legitimate git transports operators actually use
 * (`https://…`, `ssh://…`) plus the scp-like shorthand (`user@host:path`,
 * e.g. `git@github.com:acme/alpha.git`). Rejects everything else, notably: a
 * leading `-` (argv/option injection, e.g. `--upload-pack=…`), `ext::`
 * (git's arbitrary-command transport — the RCE class this predicate exists
 * to close), `file://` and bare local paths (no implicit local-clone
 * allowance at this layer), `git://` (unauthenticated/plaintext,
 * deliberately excluded — tighten-only, not used by any fixture/operator
 * flow in this codebase), and — via {@link authorityHasLeadingDash} above —
 * a scp-like/`ssh://` remote whose user or host authority segment starts
 * with `-` (CVE-2017-1000117 class: an ssh-option injection the whole-string
 * `-` guard below does not reach).
 */
export function isValidGitRemote(url: string): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  if (url.startsWith("-")) return false;
  if (/^ext::/i.test(url)) return false;
  if (/^https:\/\/\S+$/i.test(url)) return !authorityHasLeadingDash(url);
  if (/^ssh:\/\/\S+$/i.test(url)) return !authorityHasLeadingDash(url);
  if (/^[\w.-]+@[\w.-]+:\S+$/.test(url)) return !authorityHasLeadingDash(url);
  return false;
}

/**
 * A person associated with a project (team member, client contact, stakeholder).
 *
 * `id` is OPTIONAL (Phase 68 migration decision): a REQUIRED id would make every
 * person already on disk fail validation, and `ProjectsStorageService.list()`
 * silently DROPS schema-invalid entries — a required id would silently lose
 * people. Instead the storage layer backfills a stable id (deterministic:
 * slugify(name) + a dedupe suffix on collision) where one is missing, persisting
 * it on the next write (Phase 69). The company/project people MERGE (Phase 70)
 * matches by `id` when both sides have one, falling back to case-insensitive
 * `name` match when a side lacks one (older data mid-backfill).
 */
export const ProjectPersonSchema = z.object({
  id: z.string().min(1).optional(),
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
  /**
   * The root directory on the host system — OPTIONAL (Phase 98): it is genuinely
   * machine-local, and `ProjectLocalService.resolve` already falls back to
   * `<cloneRoot>/<project.id>` (this machine's Settings-configured clone base)
   * whenever `path` is absent or doesn't resolve, so hand-entering it per project
   * is unnecessary. When present it must still be non-empty.
   */
  path: z.string().min(1).optional(),
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
   * Optional custom logo, shown on the project card in place of the default
   * glyph (the glyph remains the fallback when absent, or when the image fails
   * to load): either an uploaded `data:image/*;base64,…` URI or a `/`-rooted
   * path to a bundled static asset — same `AvatarSchema` agents/pipelines use
   * (Phase 113). On disk the bytes are externalized to
   * `assets/<id>.<ext>` (`ProjectsStorageService`/`AvatarAssetStore`); the wire
   * value here is always the full data URI or `/`-path, never the bare ref.
   */
  logo: AvatarSchema.optional(),

  // --- Operational profile (M1) ---
  /** Team members, clients, and stakeholders associated with this project. */
  identity: ProjectIdentitySchema.optional(),
  /** Per-project autonomy policy (can only harden the global gate floor). */
  autonomy_policy: ProjectAutonomyPolicySchema.optional(),
  /** Daily operational rhythm: standup timing, monitoring hours. */
  daily_rhythm: ProjectDailyRhythmSchema.optional(),

  /**
   * Optional link to a `Company` (Phase 68) — standalone projects (no company)
   * keep working exactly as today; this is additive. When set, the project's
   * EFFECTIVE people/budget/integrations are the company's merged with the
   * project's own (Phase 70's resolved-project service does the merge at read
   * time — never copied here). An unknown/dangling `companyId` (its company was
   * deleted) resolves as "no company" rather than erroring.
   */
  companyId: z.string().optional(),

  /**
   * Phase 76 — the canonical clone source for this project (a `https://…` or
   * `git@…` URL), synced in the registry since the clone source is the same on
   * every machine. Distinct from `path`, which stays the canonical (but
   * machine-relative) target dir; a per-machine resolution layer
   * (`ProjectLocalService`) reconciles the two on each machine.
   *
   * Task 8 — tighten-only: `.refine()`s against {@link isValidGitRemote}, the
   * same allowlist predicate `apps/api`'s `validateRemote()` enforces at
   * clone time. This re-enforces the guard on every disk read (storage
   * re-parses `ProjectSchema` on load, not just on write), catching a
   * hand-edited-on-disk malicious value before any run tries to clone it. No
   * previously-valid fixture (`https://…`, `git@host:path`, `ssh://…`) is
   * affected — only the injection-shaped values (`ext::`, leading `-`,
   * `file://`, bare paths, `git://`) newly fail.
   */
  gitRemote: z
    .string()
    .min(1)
    .refine(isValidGitRemote, {
      message:
        'gitRemote must be an https://, ssh://, or scp-like ("user@host:path") git URL',
    })
    .optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Body accepted by `createProject` — the full entity (`id` + `name` required; `path` optional). */
export const CreateProjectSchema = ProjectSchema.omit({ hasSecrets: true });
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

/**
 * Body accepted by `updateProject` — every field optional (partial update), id +
 * hasSecrets excluded. `companyId` is re-widened to also accept `null` (Phase 72):
 * a JSON PATCH body silently drops `undefined`-valued keys on the wire, so
 * "unset this field" is otherwise inexpressible for an already-linked project —
 * `null` is the explicit "unlink the company" signal the storage layer acts on,
 * while `undefined`/absent still means "leave the current link alone". `logo` is
 * likewise re-widened to accept `null` (Phase 113, parity with agents/pipelines'
 * `avatar`) as the explicit "clear the logo" signal.
 */
export const UpdateProjectSchema = ProjectSchema.omit({ id: true, hasSecrets: true })
  .partial()
  .extend({
    companyId: z.string().optional().nullable(),
    logo: AvatarSchema.optional().nullable(),
  });
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

/**
 * Phase 76 — THIS machine's view of where a project's working dir actually
 * lives. `project.path` is the canonical registry field (synced everywhere),
 * but on any one machine it may not exist (a fresh machine, a not-yet-cloned
 * project) — this describes what `ProjectLocalService.resolve` found:
 *
 * - `source: "path"` — `project.path` exists and is a git repo; use it as-is.
 * - `source: "cloneRoot"` — `path` was absent/not-a-repo, but
 *   `<cloneRoot>/<project.id>` exists and is a git repo (a prior local clone).
 * - `source: "none"` — neither location resolves; `present`/`isGitRepo` are
 *   false and `resolvedPath` is null — the project needs a clone.
 *
 * `cloneRoot` always echoes this machine's configured clone root (even in the
 * `"none"` case) so the UI can show/offer the exact clone destination.
 */
export const ProjectLocalStateSchema = z.object({
  present: z.boolean(),
  isGitRepo: z.boolean(),
  resolvedPath: z.string().nullable(),
  source: z.enum(["path", "cloneRoot", "none"]),
  cloneRoot: z.string(),
});
export type ProjectLocalState = z.infer<typeof ProjectLocalStateSchema>;
