import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { ActivityKindSchema, ActivityRefsSchema } from "../activity/activity.schema";
import { SubsystemIdSchema, SubsystemStateSchema } from "../subsystems/subsystem.schema";

/**
 * One thing that needs the operator (Law 5 "surface and wait"): a pending approval,
 * a retries-parked run, or a currently-red CI (N4b — a STATE line: it exists while
 * the build is red and disappears when it goes green, never re-alerting). `refs`
 * carries the trace links so the card can deep-link to /runs or the approval.
 */
export const BriefingNeedsYouItemSchema = z.object({
  kind: z.enum(["approval", "parked", "ci-red"]),
  id: z.string(),
  summary: z.string(),
  at: IsoDateTimeSchema,
  refs: ActivityRefsSchema,
  /** The engagement this item belongs to (Phase 8.2) — drives the card grouping. */
  projectId: z.string().optional(),
});
export type BriefingNeedsYouItem = z.infer<typeof BriefingNeedsYouItemSchema>;

/** One thing ZIBBY did for the operator (from the activity record since the cursor). */
export const BriefingDidItemSchema = z.object({
  kind: ActivityKindSchema,
  summary: z.string(),
  at: IsoDateTimeSchema,
  /** The engagement this item belongs to (Phase 8.2), when the activity carried one. */
  projectId: z.string().optional(),
});
export type BriefingDidItem = z.infer<typeof BriefingDidItemSchema>;

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
});
export type BriefingEngagement = z.infer<typeof BriefingEngagementSchema>;

/**
 * Something ZIBBY is keeping an eye on. Two shapes share the array:
 * - a watched **channel** (`integrationId` + `newItems`), the Phase 6 shape; and
 * - a run **paused on the usage limit** (Phase 9): `runRef` + a human `summary` +
 *   the `resumeAt` epoch it will auto-resume at. No operator action is needed (it is
 *   Tier 1), so it sits in "watching", not "needs you".
 * The channel fields are optional so a run-pause entry can omit them; a channel entry
 * always carries `integrationId`.
 */
export const BriefingWatchItemSchema = z.object({
  integrationId: z.string().optional(),
  newItems: z.number().int().nonnegative().optional(),
  lastReceivedAt: IsoDateTimeSchema.optional(),
  /** Phase 9 run-pause watch: the paused run, a butler-voice line, and its resume epoch. */
  runRef: z.string().optional(),
  summary: z.string().optional(),
  resumeAt: z.number().int().nullable().optional(),
});
export type BriefingWatchItem = z.infer<typeof BriefingWatchItemSchema>;

/**
 * NS2 F3b — one subsystem's line in the briefing ("Forge: 2 PRs čekají · Puls:
 * CI zelené · Ledger: 62 % týdenního okna"): its live state + outstanding Tier-2
 * (act-then-report) and Tier-3 (surface-and-wait) counts, plus an optional
 * free-text `note` for the subsystems whose mandate has a scalar headline
 * (Ledger: the weekly usage window %; Puls: CI health). Beacon needs no special
 * shape — its mandate (Tier-3 escalation) is honored by its `tier3Count`.
 */
export const BriefingSubsystemLineSchema = z.object({
  subsystem: SubsystemIdSchema,
  name: z.string().min(1),
  state: SubsystemStateSchema,
  tier2Count: z.number().int().nonnegative(),
  tier3Count: z.number().int().nonnegative(),
  note: z.string().optional(),
});
export type BriefingSubsystemLine = z.infer<typeof BriefingSubsystemLineSchema>;

/** The headline tallies — the deterministic spine the butler-voice headline summarises. */
export const BriefingCountsSchema = z.object({
  runsFinished: z.number().int().nonnegative(),
  runsFailed: z.number().int().nonnegative(),
  parked: z.number().int().nonnegative(),
  approvalsPending: z.number().int().nonnegative(),
  channelItemsNew: z.number().int().nonnegative(),
});
export type BriefingCounts = z.infer<typeof BriefingCountsSchema>;

/**
 * The butler's briefing (Phase 6.2) — "what's happening / what happened", assembled
 * deterministically from the record. `nothingNeedsYou` (empty `needsYou`) is a
 * valid, first-class output: quiet competence is the goal. The whole object is a
 * pure function of pending approvals + parked runs + new channel items + the
 * activity entries since the last briefing, so assembly is snapshot-testable.
 */
export const BriefingSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  since: IsoDateTimeSchema,
  headline: z.string(),
  nothingNeedsYou: z.boolean(),
  needsYou: z.array(BriefingNeedsYouItemSchema),
  didForYou: z.array(BriefingDidItemSchema),
  watching: z.array(BriefingWatchItemSchema),
  /** Per-engagement rollup (Phase 8.2) — empty when nothing is project-attributed. */
  engagements: z.array(BriefingEngagementSchema),
  counts: BriefingCountsSchema,
  /** One-line summaries from the past 7 daily vault notes (M3 7-day context). */
  trend7d: z.array(z.string()).max(50).optional(),
  /** Proposed autonomous rules extracted from 30-day approval patterns (M4). */
  learnedPatterns: z.array(z.string()).max(50).optional(),
  /** Recurring-manual-work "automate it?" suggestions (M5 GapDetector). */
  automationGaps: z.array(z.string()).max(50).optional(),
  /** Weekly "3 app ideas" — interests × trends prototype pitches (M6). */
  appIdeas: z.array(z.string()).max(50).optional(),
  /** NS2 F3b — per-subsystem grouping lines. Optional and strictly additive: old
   * briefings (and a briefing whose subsystem read failed) omit it entirely. */
  subsystems: z.array(BriefingSubsystemLineSchema).optional(),
  /** NS2 F4c — true when the self-knowledge vault note has drifted from a fresh
   * compose (the nightly refresh may have failed). Optional and strictly
   * additive: absent on every briefing predating this check. */
  selfKnowledgeDrift: z.boolean().optional(),
  /** NS2 F5a — Sentinel's open security findings (CVE/secret) for the briefing. */
  securityFindings: z.array(z.string()).max(50).optional(),
  /** NS2 F5b — Maestro's merge-queue summary lines for the briefing. */
  mergeQueue: z.array(z.string()).max(50).optional(),
});
export type Briefing = z.infer<typeof BriefingSchema>;

/** Result of `POST /api/briefing/generate`: the briefing + the persisted vault note id. */
export const GenerateBriefingResultSchema = z.object({
  briefing: BriefingSchema,
  noteId: z.string(),
});
export type GenerateBriefingResult = z.infer<typeof GenerateBriefingResultSchema>;
