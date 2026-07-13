import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { AGENT_ID_REGEX } from "../agents/agent.schema";

/**
 * Allowed shape of an integration `id` — the same restrictive pattern agents use
 * (the id doubles as the on-disk file name and as a path segment for that
 * integration's channel items, so no separators / traversal). Defense in depth:
 * the storage layer re-validates independently.
 */
export const IntegrationIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(AGENT_ID_REGEX, "id may only contain letters, numbers, '.', '_' and '-'");

/** Which inbound channel an integration speaks. `kind` is immutable after create. */
export const IntegrationKindSchema = z.enum(["slack", "email", "jira", "github", "calendar"]);
export type IntegrationKind = z.infer<typeof IntegrationKindSchema>;

/**
 * Slack channel config — the conversation ids to poll. Non-secret by construction:
 * the bot token lives in the separate credentials store, never here. `.strict()`
 * so a token/password-shaped key can never sneak into the committed entity file.
 */
export const SlackConfigSchema = z
  .object({
    kind: z.literal("slack"),
    channels: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type SlackConfig = z.infer<typeof SlackConfigSchema>;

/**
 * Email (IMAP/SMTP) config. The login `user` is non-secret (an address); the
 * password lives in the credentials store. `.strict()` — same containment.
 */
export const EmailConfigSchema = z
  .object({
    kind: z.literal("email"),
    imapHost: z.string().min(1),
    imapPort: z.number().int().positive(),
    smtpHost: z.string().min(1),
    smtpPort: z.number().int().positive(),
    user: z.string().min(1),
    mailbox: z.string().min(1).optional(),
  })
  .strict();
export type EmailConfig = z.infer<typeof EmailConfigSchema>;

/**
 * Jira config — the site `baseUrl` and the account `email` (both non-secret); the
 * API token lives in the credentials store (Basic `email:token`). `jql` narrows the
 * polled issues (defaults to the project's recently-updated issues). `.strict()`.
 */
export const JiraConfigSchema = z
  .object({
    kind: z.literal("jira"),
    baseUrl: z.string().url(),
    email: z.string().min(1),
    projectKey: z.string().min(1).optional(),
    jql: z.string().min(1).optional(),
  })
  .strict();
export type JiraConfig = z.infer<typeof JiraConfigSchema>;

/**
 * GitHub config — the `repo` ("owner/name") to monitor; the PAT lives in the
 * credentials store. `streams` selects which event streams to ingest: `issues`
 * and/or `pulls` (the conversational channel), plus `ci` — which opts the repo
 * into the N3 CI monitor (workflow-run status alerts, not messages; the channel
 * adapter ignores it). Defaults to the conversational pair. `username` (optional,
 * the operator's GitHub handle) narrows polling to items that mention or are
 * assigned to that user via the Search API — omit it to poll every open
 * issue/PR in the repo (the original, unfiltered behaviour). `.strict()`.
 */
export const GitHubConfigSchema = z
  .object({
    kind: z.literal("github"),
    repo: z.string().regex(/^[^/]+\/[^/]+$/, "repo must be 'owner/name'"),
    streams: z.array(z.enum(["issues", "pulls", "ci"])).default(["issues", "pulls"]),
    username: z.string().min(1).optional(),
  })
  .strict();
export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;

/**
 * Google Calendar config — which calendar to poll (`calendarId`, defaults to the
 * service account's `primary`) and how far ahead to look (`lookaheadDays`). Auth is
 * a Google service account: the SA JSON key lives in the credentials store as the
 * single `token`, never here; the operator shares the calendar with the SA's email
 * (no domain-wide delegation needed for a personal calendar). `.strict()` — same
 * containment as the other configs.
 */
export const CalendarConfigSchema = z
  .object({
    kind: z.literal("calendar"),
    calendarId: z.string().min(1).default("primary"),
    lookaheadDays: z.number().int().positive().max(365).default(14),
  })
  .strict();
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>;

/** Discriminated on `kind` so config always matches the integration kind. */
export const IntegrationConfigSchema = z.discriminatedUnion("kind", [
  SlackConfigSchema,
  EmailConfigSchema,
  JiraConfigSchema,
  GitHubConfigSchema,
  CalendarConfigSchema,
]);
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

/** Connection health, watcher-stamped (`markSync`), like an automation's lastFiredAt. */
export const IntegrationStatusSchema = z.enum(["connected", "disconnected", "error"]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

/**
 * Enforces "exactly one owner": an integration belongs to a project OR a company
 * (Phase 68), never both, never neither. Shared by `IntegrationSchema` and
 * `CreateIntegrationSchema` via `.superRefine`. Not applied to `UpdateIntegrationSchema`
 * — a partial patch may touch neither field (no ownership change) without tripping it.
 */
function requireExactlyOneOwner(
  data: { projectId?: string | undefined; companyId?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  const hasProject = data.projectId !== undefined;
  const hasCompany = data.companyId !== undefined;
  if (hasProject === hasCompany) {
    const message = "exactly one of projectId or companyId must be set (not both, not neither)";
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["projectId"] });
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["companyId"] });
  }
}

/**
 * The un-refined object shape shared by the full entity and the create body —
 * kept separate from `IntegrationSchema` because `.superRefine` returns a
 * `ZodEffects`, which cannot `.omit()`/`.partial()` (needed below for the update
 * body).
 */
const IntegrationObjectSchema = z.object({
  id: IntegrationIdSchema,
  kind: IntegrationKindSchema,
  /**
   * The project this integration belongs to — a foreign key to a project `id`.
   * Mutually exclusive with `companyId` (Phase 68): an integration is owned by a
   * project OR a company, never both, never neither (enforced by `.superRefine`
   * below). Never re-keyed (re-keying the integration `id` would orphan its
   * credentials / channel items), but the owner field is free to change to
   * re-assign.
   */
  projectId: z.string().min(1).optional(),
  /**
   * The company this integration belongs to (Phase 68) — a foreign key to a
   * company `id`. Mutually exclusive with `projectId`; see `projectId` above.
   */
  companyId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
  config: IntegrationConfigSchema,
  status: IntegrationStatusSchema.default("disconnected"),
  lastSyncAt: IsoDateTimeSchema.optional(),
  lastError: z.string().optional(),
  /** Computed at read time: whether a credentials file exists. Never persisted. */
  hasCredentials: z.boolean().default(false),
});

/**
 * A configured inbound channel (Phase 5). On disk: one `<id>.json` under
 * `data/integrations`. `status` / `lastSyncAt` / `lastError` are stamped by the
 * watcher and the connection test, never by a client. `hasCredentials` is computed
 * at read time from the separate gitignored credentials store — the secret itself
 * is never stored on, nor served from, the entity (Law 3 / credentials hygiene).
 */
export const IntegrationSchema = IntegrationObjectSchema.superRefine(requireExactlyOneOwner);
export type Integration = z.infer<typeof IntegrationObjectSchema>;

/**
 * Create body — the operator supplies id, kind, config, exactly one owner
 * (+ optional name/enabled). Status fields and hasCredentials are server-owned,
 * so they're omitted.
 */
const CreateIntegrationObjectSchema = z.object({
  id: IntegrationIdSchema,
  kind: IntegrationKindSchema,
  projectId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  config: IntegrationConfigSchema,
});
export const CreateIntegrationSchema = CreateIntegrationObjectSchema.superRefine(
  requireExactlyOneOwner,
);
export type CreateIntegrationInput = z.infer<typeof CreateIntegrationObjectSchema>;

/**
 * Update body — `id` and `kind` are immutable (kind drives the config union and
 * the adapter; changing it would orphan items + credentials), so both are omitted;
 * the rest is partial. Not refined with `requireExactlyOneOwner`: a patch that
 * touches neither `projectId` nor `companyId` (no ownership change) must stay valid.
 */
export const UpdateIntegrationSchema = IntegrationObjectSchema.omit({
  id: true,
  kind: true,
  status: true,
  lastSyncAt: true,
  lastError: true,
  hasCredentials: true,
}).partial();
export type UpdateIntegrationInput = z.infer<typeof UpdateIntegrationSchema>;

/**
 * Closed, per-kind credentials write body. Slack carries a bot `token`, email a
 * `password` — nothing else parses, so a misdirected secret can't be stored under
 * the wrong key. Credentials are write-only over HTTP: there is no read endpoint.
 */
export const CredentialsInputSchema = z.union([
  z.object({ token: z.string().min(1) }).strict(),
  z.object({ password: z.string().min(1) }).strict(),
]);
export type CredentialsInput = z.infer<typeof CredentialsInputSchema>;

/** Result of a connection test — the adapter's verdict + a short human detail. */
export const TestResultSchema = z.object({
  ok: z.boolean(),
  detail: z.string(),
});
export type TestResult = z.infer<typeof TestResultSchema>;
