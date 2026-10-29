import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * Phase 4 — Autopilot. `off` is the normal gate; `full` is an operator-switched,
 * temporary overlay that resolves the covered `ask` classes (GitHub PR reviews and
 * comments, pushes to ZIBBY's own `zibby/*` PR branches, concrete channel replies)
 * as act-then-report (Tier 2). Never-rules, merge and every other `ask` are untouched.
 */
export const AutopilotLevelSchema = z.enum(["off", "full"]);
export type AutopilotLevel = z.infer<typeof AutopilotLevelSchema>;

/** Who switched it: the dashboard with the operator token, or the operator chat (off only). */
export const AutopilotActorSchema = z.enum(["operator", "chat"]);
export type AutopilotActor = z.infer<typeof AutopilotActorSchema>;

/** `autopilot.json` — the on-disk state. Absent / garbage reads as `{ level: "off" }`. */
export const AutopilotStateSchema = z
  .object({
    level: AutopilotLevelSchema,
    since: IsoDateTimeSchema.optional(),
    by: AutopilotActorSchema.optional(),
  })
  .strict();
export type AutopilotState = z.infer<typeof AutopilotStateSchema>;

/** `GET/PUT /api/autopilot` — the state plus how many approvals are still pending (never auto-decided). */
export const AutopilotStatusSchema = AutopilotStateSchema.extend({
  pendingApprovals: z.number().int().min(0),
});
export type AutopilotStatus = z.infer<typeof AutopilotStatusSchema>;

export const SetAutopilotInputSchema = z.object({ level: AutopilotLevelSchema }).strict();
export type SetAutopilotInput = z.infer<typeof SetAutopilotInputSchema>;
