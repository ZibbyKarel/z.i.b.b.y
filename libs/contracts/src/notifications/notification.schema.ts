import { z } from "zod";
import { DepartmentIdSchema } from "../departments/department.schema";

/**
 * One unread failed run in the operator's notification bell. A failed run stays
 * unread until the operator marks it read (one by one, or all at once); the same
 * read state drives a department's `errorCount` and so Zibby's `error` state.
 */
export const FailedRunNotificationSchema = z.object({
  runId: z.string().min(1),
  /** Human title — the task title, else the run title, else the owner id. */
  title: z.string(),
  /** The owning department, when the run's agent/workflow carries one. */
  department: DepartmentIdSchema.optional(),
  /** Best-available completion signal (task outcome time, else start time). */
  failedAt: z.string(),
});
export type FailedRunNotification = z.infer<typeof FailedRunNotificationSchema>;

/** `runIds` marks those runs read; omitted marks every currently unread run read. */
export const MarkNotificationsReadSchema = z.object({
  runIds: z.array(z.string().min(1)).optional(),
});
export type MarkNotificationsReadInput = z.infer<typeof MarkNotificationsReadSchema>;
