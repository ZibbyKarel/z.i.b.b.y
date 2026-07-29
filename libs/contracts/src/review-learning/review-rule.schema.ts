import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/** A rule id is a kebab slug — the model coins it and it is also the dedup key. */
export const REVIEW_RULE_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Lifecycle: counted → parked for sign-off → grounded → refused (still deduped against). */
export const ReviewRuleStatusSchema = z.enum(["observed", "proposed", "active", "retired"]);
export type ReviewRuleStatus = z.infer<typeof ReviewRuleStatusSchema>;

/** Where an active rule is grounded: its own project only, or every run. */
export const ReviewRuleScopeSchema = z.enum(["project", "global"]);
export type ReviewRuleScope = z.infer<typeof ReviewRuleScopeSchema>;

/**
 * One review comment that produced (or reinforced) a rule. `commentId` is
 * NAMESPACED by source — `rc-` inline review comment, `ic-` PR conversation
 * comment, `rv-` review body — because ids from the three GitHub endpoints can
 * collide, and the dedup that keeps counts honest is a pure id check.
 */
export const ReviewRuleOccurrenceSchema = z.object({
  commentId: z.string().min(1),
  prUrl: z.string().min(1),
  commentUrl: z.string().min(1),
  author: z.string().min(1),
  at: IsoDateTimeSchema,
  excerpt: z.string().min(1).max(400),
});
export type ReviewRuleOccurrence = z.infer<typeof ReviewRuleOccurrenceSchema>;

/**
 * A learned review rule. `occurrences.length` IS the count — there is no separate
 * counter to drift. A rule reaches `proposed` on its second occurrence and only an
 * operator approval moves it to `active`, so inbound PR text can never change how
 * ZIBBY behaves on its own (Law 4).
 */
export const ReviewRuleSchema = z.object({
  id: z.string().regex(REVIEW_RULE_ID_REGEX),
  scope: ReviewRuleScopeSchema,
  /** ONE imperative sentence — what to do next time. */
  rule: z.string().min(1).max(160),
  rationale: z.string().max(300).optional(),
  status: ReviewRuleStatusSchema,
  occurrences: z.array(ReviewRuleOccurrenceSchema).min(1),
  /** The approval that activated the rule (forensic link back to the decision). */
  approvalRef: z.string().min(1).optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ReviewRule = z.infer<typeof ReviewRuleSchema>;

/**
 * One project's on-disk file: its rules plus the repo-wide `since` cursor. The
 * cursor advances only after a successful distillation, so a failed pass replays.
 */
export const ReviewRulesFileSchema = z.object({
  rules: z.array(ReviewRuleSchema).default([]),
  cursor: IsoDateTimeSchema.optional(),
});
export type ReviewRulesFile = z.infer<typeof ReviewRulesFileSchema>;
