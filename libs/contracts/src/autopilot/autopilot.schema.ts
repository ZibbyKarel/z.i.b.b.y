import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * Phase 4 — Autopilot. `off` is the normal gate; `full` is an operator-switched,
 * temporary overlay that resolves the covered `ask` classes picked in its `scope` (PR
 * reviews, addressing review comments, concrete channel replies) plus pushes onto ZIBBY's
 * or the operator's own PR branches as act-then-report (Tier 2). Never-rules, merge and every other `ask` are untouched.
 */
export const AutopilotLevelSchema = z.enum(["off", "full"]);
export type AutopilotLevel = z.infer<typeof AutopilotLevelSchema>;

/** Who switched it: the dashboard with the operator token, or the operator chat (off only). */
export const AutopilotActorSchema = z.enum(["operator", "chat"]);
export type AutopilotActor = z.infer<typeof AutopilotActorSchema>;

/**
 * Which covered classes autopilot decides, picked by the operator when switching it on.
 * Pushes onto ZIBBY's or the operator's own PR branches are not a toggle: they ride along
 * with whichever class produced them (a `pr-fix-ci` push is always covered while on).
 * - `reviews` — post ZIBBY's finished PR code reviews;
 * - `comments` — address review comments: push the fixes, post the thread replies;
 * - `communication` — concrete replies in channels (GitHub/GitLab/Jira questions, Slack).
 */
export const AutopilotScopeSchema = z
  .object({ reviews: z.boolean(), comments: z.boolean(), communication: z.boolean() })
  .strict();
export type AutopilotScope = z.infer<typeof AutopilotScopeSchema>;
export type AutopilotScopeKey = keyof AutopilotScope;

/** A `full` state without `scope` (written before the toggles existed) covers everything. */
export const FULL_AUTOPILOT_SCOPE: AutopilotScope = {
  reviews: true,
  comments: true,
  communication: true,
};

/** `autopilot.json` — the on-disk state. Absent / garbage reads as `{ level: "off" }`. */
export const AutopilotStateSchema = z
  .object({
    level: AutopilotLevelSchema,
    since: IsoDateTimeSchema.optional(),
    by: AutopilotActorSchema.optional(),
    scope: AutopilotScopeSchema.optional(),
  })
  .strict();
export type AutopilotState = z.infer<typeof AutopilotStateSchema>;

/** `GET/PUT /api/autopilot` — the state plus how many approvals are still pending (never auto-decided). */
export const AutopilotStatusSchema = AutopilotStateSchema.extend({
  pendingApprovals: z.number().int().min(0),
});
export type AutopilotStatus = z.infer<typeof AutopilotStatusSchema>;

/** `scope` only means something with `full`; omitted there = everything on. */
export const SetAutopilotInputSchema = z
  .object({ level: AutopilotLevelSchema, scope: AutopilotScopeSchema.optional() })
  .strict();
export type SetAutopilotInput = z.infer<typeof SetAutopilotInputSchema>;
