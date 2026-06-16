import { z } from "zod"
import { AGENT_ID_REGEX } from "../agents/agent.schema"
import { ProjectIdSchema } from "../projects/project.schema"

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
  .regex(AGENT_ID_REGEX, "id may only contain letters, numbers, '.', '_' and '-'")

/** Which inbound channel an integration speaks. `kind` is immutable after create. */
export const IntegrationKindSchema = z.enum(["slack", "email"])
export type IntegrationKind = z.infer<typeof IntegrationKindSchema>

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
  .strict()
export type SlackConfig = z.infer<typeof SlackConfigSchema>

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
  .strict()
export type EmailConfig = z.infer<typeof EmailConfigSchema>

/** Discriminated on `kind` so config always matches the integration kind. */
export const IntegrationConfigSchema = z.discriminatedUnion("kind", [
  SlackConfigSchema,
  EmailConfigSchema,
])
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>

/** Connection health, watcher-stamped (`markSync`), like an automation's lastFiredAt. */
export const IntegrationStatusSchema = z.enum(["connected", "disconnected", "error"])
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>

/**
 * A configured inbound channel (Phase 5). On disk: one `<id>.json` under
 * `data/integrations`. `status` / `lastSyncAt` / `lastError` are stamped by the
 * watcher and the connection test, never by a client. `hasCredentials` is computed
 * at read time from the separate gitignored credentials store — the secret itself
 * is never stored on, nor served from, the entity (Law 3 / credentials hygiene).
 */
export const IntegrationSchema = z.object({
  id: IntegrationIdSchema,
  kind: IntegrationKindSchema,
  name: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
  config: IntegrationConfigSchema,
  status: IntegrationStatusSchema.default("disconnected"),
  lastSyncAt: z.string().datetime().optional(),
  lastError: z.string().optional(),
  /** Computed at read time: whether a credentials file exists. Never persisted. */
  hasCredentials: z.boolean().default(false),
  /** Project ids this integration monitors (used by the triage layer to route items). */
  monitorsProjects: z.array(ProjectIdSchema).default([]),
})
export type Integration = z.infer<typeof IntegrationSchema>

/**
 * Create body — the operator supplies id, kind, config (+ optional name/enabled).
 * Status fields and hasCredentials are server-owned, so they're omitted.
 */
export const CreateIntegrationSchema = z.object({
  id: IntegrationIdSchema,
  kind: IntegrationKindSchema,
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  config: IntegrationConfigSchema,
  monitorsProjects: z.array(ProjectIdSchema).default([]),
})
export type CreateIntegrationInput = z.infer<typeof CreateIntegrationSchema>

/**
 * Update body — `id` and `kind` are immutable (kind drives the config union and
 * the adapter; changing it would orphan items + credentials), so both are omitted;
 * the rest is partial.
 */
export const UpdateIntegrationSchema = IntegrationSchema.omit({
  id: true,
  kind: true,
  status: true,
  lastSyncAt: true,
  lastError: true,
  hasCredentials: true,
}).partial()
export type UpdateIntegrationInput = z.infer<typeof UpdateIntegrationSchema>

/**
 * Closed, per-kind credentials write body. Slack carries a bot `token`, email a
 * `password` — nothing else parses, so a misdirected secret can't be stored under
 * the wrong key. Credentials are write-only over HTTP: there is no read endpoint.
 */
export const CredentialsInputSchema = z.union([
  z.object({ token: z.string().min(1) }).strict(),
  z.object({ password: z.string().min(1) }).strict(),
])
export type CredentialsInput = z.infer<typeof CredentialsInputSchema>

/** Result of a connection test — the adapter's verdict + a short human detail. */
export const TestResultSchema = z.object({
  ok: z.boolean(),
  detail: z.string(),
})
export type TestResult = z.infer<typeof TestResultSchema>
