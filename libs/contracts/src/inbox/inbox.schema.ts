import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { RoadmapItemSchema, RoadmapSourceKindSchema } from "../roadmap/roadmap-item.schema";

/**
 * Inbox (docs/plans/inbox-ui-spec.md): a view over the synced roadmap cache
 * plus the operator's GitHub PRs. Jira/GitHub stay the source of truth for
 * the task; ZIBBY never edits titles or descriptions from here.
 */

/** A roadmap task in the operator's scope, joined with its project's company/team. */
export const InboxRoadmapItemSchema = RoadmapItemSchema.extend({
  project: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  companyId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
  /** True when the operator permanently hid it (`inbox-state.json`). */
  hidden: z.boolean(),
});
export type InboxRoadmapItem = z.infer<typeof InboxRoadmapItemSchema>;

/** The epic an inbox item belongs to; progress counts every child, not just the scoped ones. */
export const InboxEpicSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  key: z.string().min(1).optional(),
  title: z.string().min(1),
  source: RoadmapSourceKindSchema,
  url: z.string().url().optional(),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type InboxEpic = z.infer<typeof InboxEpicSchema>;

/** A non-blocking per-integration failure surfaced as a banner above the list. */
export const InboxSourceErrorSchema = z.object({
  projectId: z.string().min(1),
  source: z.enum(["jira", "github"]),
  message: z.string().min(1),
});
export type InboxSourceError = z.infer<typeof InboxSourceErrorSchema>;

export const InboxItemsResponseSchema = z.object({
  items: z.array(InboxRoadmapItemSchema),
  epics: z.array(InboxEpicSchema),
  /** Projects with a Jira/GitHub integration — what the `Sync` button syncs. Empty = "no integrations" state. */
  syncProjectIds: z.array(z.string().min(1)),
  /** Oldest last-sync across the synced projects (absent before the first sync). */
  syncedAt: IsoDateTimeSchema.optional(),
  errors: z.array(InboxSourceErrorSchema),
});
export type InboxItemsResponse = z.infer<typeof InboxItemsResponseSchema>;

export const InboxPrCiSchema = z.enum(["passing", "failing", "pending", "unknown"]);
export type InboxPrCi = z.infer<typeof InboxPrCiSchema>;
export const InboxPrReviewSchema = z.enum(["approved", "changes-requested", "none"]);
export type InboxPrReview = z.infer<typeof InboxPrReviewSchema>;
/** One prominent blocker per row; the array order IS the sort order. */
export const INBOX_PR_BLOCKERS = [
  "ci-failing",
  "changes-requested",
  "merge-conflict",
  "awaiting-review",
  "ready-to-merge",
] as const;
export const InboxPrBlockerSchema = z.enum(INBOX_PR_BLOCKERS);
export type InboxPrBlocker = z.infer<typeof InboxPrBlockerSchema>;

export const InboxPrSchema = z.object({
  /** Only GitHub today; the field keeps the list open for another source. */
  source: z.literal("github"),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().url(),
  repo: z.string().min(1),
  author: z.string(),
  createdAt: IsoDateTimeSchema,
  draft: z.boolean(),
  ci: InboxPrCiSchema,
  review: InboxPrReviewSchema,
  /** `null` while GitHub is still computing mergeability. */
  mergeable: z.boolean().nullable(),
  bucket: z.enum(["to-review", "mine"]),
  reviewReason: z.enum(["direct", "team"]).optional(),
  /** `org/team` slug when `reviewReason === "team"`. */
  reviewTeam: z.string().min(1).optional(),
  blocker: InboxPrBlockerSchema,
  projectId: z.string().min(1),
  companyId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
});
export type InboxPr = z.infer<typeof InboxPrSchema>;

export const InboxPrsResponseSchema = z.object({
  prs: z.array(InboxPrSchema),
  errors: z.array(InboxSourceErrorSchema),
});
export type InboxPrsResponse = z.infer<typeof InboxPrsResponseSchema>;

/** Hide key: the item's source identity, stable across re-syncs. */
export const InboxHiddenKeySchema = z.object({
  integrationId: z.string().min(1),
  externalId: z.string().min(1),
});
export type InboxHiddenKey = z.infer<typeof InboxHiddenKeySchema>;

/** `.zibby/data/inbox-state.json` — operator-personal, gitignored. */
export const InboxStateSchema = z.object({
  hidden: z.array(InboxHiddenKeySchema).default([]),
});
export type InboxState = z.infer<typeof InboxStateSchema>;

export const SetInboxHiddenSchema = InboxHiddenKeySchema.extend({ hidden: z.boolean() }).strict();
export type SetInboxHidden = z.infer<typeof SetInboxHiddenSchema>;
