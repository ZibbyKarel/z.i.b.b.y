import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * The operator channel (Slack bot DM) — ZIBBY's outbound line to the operator's
 * phone. The closed vocabulary of what may be pushed there: each kind maps from an
 * EXISTING activity event (see `apps/api/src/operator-channel/operator-events.ts`),
 * is Tier-2 (act, then report) or Tier-3 (surface and wait), and is toggleable.
 * Tier-1 work never has a kind here, so it can never be sent.
 */
export const OperatorEventKindSchema = z.enum([
  /** Tier-2 — a task's `pr` output opened a PR. */
  "pr-opened",
  /** Tier-3 — a PR code review finished and waits to be posted to GitHub. */
  "review-finished",
  /** Tier-2 — a dispatched task's run finished without a PR. */
  "run-completed",
  /** Tier-3 — any other approval is waiting for the operator. */
  "approval-waiting",
  /** Tier-3 — a run/goal parked for human review (retries or limit exhausted). */
  "run-parked",
  /** Tier-3 — a task was held over its budget cap. */
  "budget-cap",
  /** Tier-2 — a red CI run came in and ZIBBY dispatched the fix. */
  "ci-red",
  /** Tier-2 — the daily briefing was generated (the optional digest). */
  "briefing",
]);
export type OperatorEventKind = z.infer<typeof OperatorEventKindSchema>;

/** Everything but the briefing digest is on by default (the digest is opt-in). */
export const DEFAULT_OPERATOR_EVENTS: OperatorEventKind[] = OperatorEventKindSchema.options.filter(
  (k) => k !== "briefing",
);

/**
 * The secrets the Slack transport needs, stored through the credentials store and
 * never in the settings file: the bot token (`xoxb-…`, Web API) and the app-level
 * token (`xapp-…`, Socket Mode).
 */
export const OperatorCredentialKindSchema = z.enum(["slack-bot", "slack-app"]);
export type OperatorCredentialKind = z.infer<typeof OperatorCredentialKindSchema>;

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");

/** Quiet hours — Tier-2 is held back, Tier-3 still breaks through (flagged). */
export const QuietHoursSchema = z.object({ from: HHMM, to: HHMM, tz: z.string().min(1) }).strict();
export type QuietHours = z.infer<typeof QuietHoursSchema>;

/**
 * `operator-channel/operator-channel.json`. `operatorUserIds` is the allowlist the
 * inbound side (Phase 2) authenticates against by Slack user id — never by name.
 * `dmChannelId` is resolved by the bot (`conversations.open`), never typed in.
 * `allowSlackApprovals` is pinned `false`: approvals are decided in ZIBBY only.
 */
export const OperatorChannelSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    transport: z.literal("slack").default("slack"),
    operatorUserIds: z
      .array(z.string().regex(/^[UW][A-Z0-9]+$/, "expected a Slack user id"))
      .max(5)
      .default([]),
    dmChannelId: z.string().min(1).optional(),
    /** Base URL the "Open in ZIBBY" buttons link to — the private Tailscale URL. */
    publicBaseUrl: z.string().url().optional(),
    locale: z.enum(["cs", "en"]).default("cs"),
    notify: z
      .object({
        events: z.array(OperatorEventKindSchema).default(DEFAULT_OPERATOR_EVENTS),
        quietHours: QuietHoursSchema.optional(),
        maxPerHour: z.number().int().min(1).max(120).default(20),
      })
      .strict()
      .prefault({}),
    allowSlackApprovals: z.literal(false).default(false),
  })
  .strict();
export type OperatorChannelSettings = z.infer<typeof OperatorChannelSettingsSchema>;

/** What `PUT settings` accepts — everything but the bot-resolved `dmChannelId`. */
export const OperatorChannelSettingsInputSchema = OperatorChannelSettingsSchema.omit({
  dmChannelId: true,
});
export type OperatorChannelSettingsInput = z.input<typeof OperatorChannelSettingsInputSchema>;

/**
 * One line of the delivery log (`operator-channel/deliveries.jsonl`) — the answer
 * to "what did you tell me?" (Law 5). One entry per notified target, so a coalesced
 * message logs every item it carried under the same `messageRef`.
 */
export const OperatorDeliveryEntrySchema = z.object({
  ts: IsoDateTimeSchema,
  kind: z.union([OperatorEventKindSchema, z.literal("test")]),
  /** What the notification is about: a PR url, a task/run/approval id. */
  targetRef: z.string(),
  /** The channel's message id (Slack: the message `ts`) when sent. */
  messageRef: z.string().optional(),
  /** `quiet-hours` / `capped` — held back by policy; `failed` — the send errored. */
  status: z.enum(["sent", "failed", "quiet-hours", "capped"]),
  detail: z.string().optional(),
});
export type OperatorDeliveryEntry = z.infer<typeof OperatorDeliveryEntrySchema>;

/** `GET /api/operator-channel/status`. Never carries a token, only whether one is stored. */
export const OperatorChannelStatusSchema = z.object({
  enabled: z.boolean(),
  transport: z.literal("slack"),
  /** `fake` under the offline test seam — nothing leaves the process. */
  mode: z.enum(["slack", "fake"]),
  credentials: z.object({ bot: z.boolean(), app: z.boolean() }),
  connected: z.boolean(),
  /** Inbound (Phase 2): the transport is receiving the operator's DMs (Slack: Socket Mode open). */
  listening: z.boolean(),
  workspace: z.string().optional(),
  dmResolved: z.boolean(),
  lastError: z.string().optional(),
  lastDelivery: OperatorDeliveryEntrySchema.optional(),
});
export type OperatorChannelStatus = z.infer<typeof OperatorChannelStatusSchema>;

/** Body of `PUT /api/operator-channel/credentials/:kind` — write-only. */
export const OperatorCredentialInputSchema = z.object({ token: z.string().min(1) }).strict();
export type OperatorCredentialInput = z.infer<typeof OperatorCredentialInputSchema>;
