import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { AutomationSchema } from "./automation.schema";

/** How many fire records (record + log) are kept per automation; older ones are pruned. */
export const AUTOMATION_FIRES_KEEP = 50;

export const AutomationFireStatusSchema = z.enum(["running", "done", "error"]);
export type AutomationFireStatus = z.infer<typeof AutomationFireStatusSchema>;

export const AutomationFireSourceSchema = z.enum(["cron", "manual", "signal"]);
export type AutomationFireSource = z.infer<typeof AutomationFireSourceSchema>;

/**
 * One fire of an automation (cron, manual trigger or signal), stored as
 * `automation-fires/<automationId>/<id>.json` next to a plain-text `<id>.log`.
 * A run-backed target carries `runRef` (the run owns its own lifecycle and log).
 */
export const AutomationFireSchema = z.object({
  id: z.string().min(1),
  automationId: z.string().min(1),
  source: AutomationFireSourceSchema,
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema.optional(),
  durationMs: z.number().int().min(0).optional(),
  status: AutomationFireStatusSchema,
  result: z.string().optional(),
  error: z.string().optional(),
  runRef: z.string().optional(),
});
export type AutomationFire = z.infer<typeof AutomationFireSchema>;

/** Response-only read model: the automation plus its latest fire (never persisted). */
export const AutomationViewSchema = AutomationSchema.extend({
  lastFire: AutomationFireSchema.optional(),
});
export type AutomationView = z.infer<typeof AutomationViewSchema>;
