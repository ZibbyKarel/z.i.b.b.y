import { z } from "zod"
import { ActivityKindSchema, ActivityRefsSchema } from "../activity/activity.schema"

/**
 * One thing that needs the operator (Law 5 "surface and wait"): a pending approval
 * or a retries-parked run. `refs` carries the trace links so the card can deep-link
 * to /runs or the approval.
 */
export const BriefingNeedsYouItemSchema = z.object({
  kind: z.enum(["approval", "parked"]),
  id: z.string(),
  summary: z.string(),
  at: z.string().datetime(),
  refs: ActivityRefsSchema,
  /** The engagement this item belongs to (Phase 8.2) — drives the card grouping. */
  projectId: z.string().optional(),
})
export type BriefingNeedsYouItem = z.infer<typeof BriefingNeedsYouItemSchema>

/** One thing ZIBBY did for the operator (from the activity record since the cursor). */
export const BriefingDidItemSchema = z.object({
  kind: ActivityKindSchema,
  summary: z.string(),
  at: z.string().datetime(),
  /** The engagement this item belongs to (Phase 8.2), when the activity carried one. */
  projectId: z.string().optional(),
})
export type BriefingDidItem = z.infer<typeof BriefingDidItemSchema>

/**
 * One engagement's slice of the briefing (Phase 8.2): how many things need the
 * operator, how many ZIBBY handled, and how many tasks are waiting (queued) or held
 * over budget. The card groups its flat lists by `projectId`; this is the per-group
 * headline. Sorted needsYou-desc, then name.
 */
export const BriefingEngagementSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  needsYou: z.number().int().nonnegative(),
  didForYou: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  held: z.number().int().nonnegative(),
})
export type BriefingEngagement = z.infer<typeof BriefingEngagementSchema>

/** A channel ZIBBY is watching, with the count of new items in the window. */
export const BriefingWatchItemSchema = z.object({
  integrationId: z.string(),
  newItems: z.number().int().nonnegative(),
  lastReceivedAt: z.string().datetime().optional(),
})
export type BriefingWatchItem = z.infer<typeof BriefingWatchItemSchema>

/** The headline tallies — the deterministic spine the butler-voice headline summarises. */
export const BriefingCountsSchema = z.object({
  runsFinished: z.number().int().nonnegative(),
  runsFailed: z.number().int().nonnegative(),
  parked: z.number().int().nonnegative(),
  approvalsPending: z.number().int().nonnegative(),
  channelItemsNew: z.number().int().nonnegative(),
})
export type BriefingCounts = z.infer<typeof BriefingCountsSchema>

/**
 * The butler's briefing (Phase 6.2) — "what's happening / what happened", assembled
 * deterministically from the record. `nothingNeedsYou` (empty `needsYou`) is a
 * valid, first-class output: quiet competence is the goal. The whole object is a
 * pure function of pending approvals + parked runs + new channel items + the
 * activity entries since the last briefing, so assembly is snapshot-testable.
 */
export const BriefingSchema = z.object({
  generatedAt: z.string().datetime(),
  since: z.string().datetime(),
  headline: z.string(),
  nothingNeedsYou: z.boolean(),
  needsYou: z.array(BriefingNeedsYouItemSchema),
  didForYou: z.array(BriefingDidItemSchema),
  watching: z.array(BriefingWatchItemSchema),
  /** Per-engagement rollup (Phase 8.2) — empty when nothing is project-attributed. */
  engagements: z.array(BriefingEngagementSchema),
  counts: BriefingCountsSchema,
})
export type Briefing = z.infer<typeof BriefingSchema>

/** Result of `POST /api/briefing/generate`: the briefing + the persisted vault note id. */
export const GenerateBriefingResultSchema = z.object({
  briefing: BriefingSchema,
  noteId: z.string(),
})
export type GenerateBriefingResult = z.infer<typeof GenerateBriefingResultSchema>
