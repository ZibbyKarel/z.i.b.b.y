import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { DepartmentIdSchema } from "../departments/department.schema";
import { ScheduledTaskSchema, TaskSourceSchema } from "./task.schema";

/**
 * ZB-04a §5 — the `GET /api/tasks/parents` read model's derived per-(sub)task
 * bucket. Five states, not the six of {@link ScheduledTaskStatusSchema} or the
 * agent-state O-04 mapping: this is a coarser rollup purpose-built for the
 * parent/subtask table in PART-B.md.
 */
export const TaskParentStateSchema = z.enum(["error", "blocked", "working", "done", "thinking"]);
export type TaskParentState = z.infer<typeof TaskParentStateSchema>;

/**
 * One subtask's summary row, as carried on its parent (`TaskParentSchema.subtasks`)
 * and returned bare by `GET /api/departments/:id/subtasks`. `step`/`department`
 * are absent until ZB-05a actually dispatches a chain step — this phase only
 * shapes the read model.
 */
export const SubtaskSummarySchema = z.object({
  taskId: z.string().min(1),
  step: z.number().int().nonnegative().optional(),
  department: DepartmentIdSchema.optional(),
  state: TaskParentStateSchema,
  runRef: z.string().optional(),
});
export type SubtaskSummary = z.infer<typeof SubtaskSummarySchema>;

/**
 * One top-level task (`parentTaskId` absent) in the `GET /api/tasks/parents`
 * feed: its own identity plus its subtasks summary and a derived overall
 * `state` — see `deriveParentState` in `apps/api/src/tasks/task-parents.service.ts`
 * for the exact table (PART-B.md ZB-04a §5).
 */
export const TaskParentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  text: z.string(),
  createdAt: IsoDateTimeSchema,
  projectId: z.string().optional(),
  department: DepartmentIdSchema.optional(),
  source: TaskSourceSchema.optional(),
  state: TaskParentStateSchema,
  subtasks: z.array(SubtaskSummarySchema),
});
export type TaskParent = z.infer<typeof TaskParentSchema>;

/**
 * `GET /api/tasks/:id`'s body: the full stored task plus its subtasks summary
 * (deliverable 5 — "`GET /api/tasks/:id` includes the `subtasks[]`").
 */
export const TaskDetailSchema = ScheduledTaskSchema.extend({
  subtasks: z.array(SubtaskSummarySchema),
});
export type TaskDetail = z.infer<typeof TaskDetailSchema>;

/**
 * Query for `GET /api/tasks/parents` — every filter is optional (omitted =
 * unfiltered); `before` is the opaque `<createdAt>|<id>` cursor of the
 * previous page's oldest parent, mirroring `ArchivePageQuerySchema`.
 */
export const TaskParentsQuerySchema = z.object({
  company: z.string().optional(),
  project: z.string().optional(),
  department: DepartmentIdSchema.optional(),
  state: TaskParentStateSchema.optional(),
  source: TaskSourceSchema.optional(),
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type TaskParentsQuery = z.infer<typeof TaskParentsQuerySchema>;

/** One page of `GET /api/tasks/parents` — newest-first, same cursor shape as `ArchivePageSchema`. */
export const TaskParentsPageSchema = z.object({
  items: z.array(TaskParentSchema),
  nextCursor: z.string().nullable(),
});
export type TaskParentsPage = z.infer<typeof TaskParentsPageSchema>;
