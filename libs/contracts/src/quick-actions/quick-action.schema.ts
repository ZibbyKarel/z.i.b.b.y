import { z } from "zod";
import { AgentTaskTargetSchema, WorkflowTaskTargetSchema } from "../tasks/task.schema";

/** Where a quick action's task is routed. Omitted = classify like a free-text task. */
export const QuickActionTargetSchema = z.discriminatedUnion("kind", [
  AgentTaskTargetSchema,
  WorkflowTaskTargetSchema,
]);
export type QuickActionTarget = z.infer<typeof QuickActionTargetSchema>;

/** One operator-defined one-click task: button label + the task text to enqueue. */
export const QuickActionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(8000),
  target: QuickActionTargetSchema.optional(),
});
export type QuickAction = z.infer<typeof QuickActionSchema>;

/** The whole list, in display order. */
export const QuickActionsSchema = z.array(QuickActionSchema).max(50);
export type QuickActions = z.infer<typeof QuickActionsSchema>;
