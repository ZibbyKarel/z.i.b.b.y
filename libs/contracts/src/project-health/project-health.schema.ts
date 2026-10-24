import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { ProjectIdSchema } from "../projects/project.schema";

/**
 * TODO 11 — a project's health is STATE, not an event (the N4b CI-status
 * precedent): one status per project, overwritten on every check. Only the
 * transitions (up→down, down→up) are recorded as activity.
 */
export const ProjectHealthStateSchema = z.enum(["up", "down"]);
export type ProjectHealthState = z.infer<typeof ProjectHealthStateSchema>;

/** Max length of a stored check error ("HTTP 503", "timeout after 10000 ms", a network message). */
export const PROJECT_HEALTH_ERROR_MAX = 500;

/** The last known health of one project's `healthCheck.url`. */
export const ProjectHealthStatusSchema = z.object({
  projectId: ProjectIdSchema,
  /** The URL that was checked (a changed url discards the status — a first check). */
  url: z.string().min(1),
  state: ProjectHealthStateSchema,
  /** When the current state streak began. */
  sinceAt: IsoDateTimeSchema,
  /** When the last check ran. */
  checkedAt: IsoDateTimeSchema,
  httpStatus: z.number().int().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  error: z.string().max(PROJECT_HEALTH_ERROR_MAX).optional(),
  /** The task the last "Analyzovat" click created — kept while down, cleared on recovery. */
  analysisTaskId: z.string().min(1).optional(),
});
export type ProjectHealthStatus = z.infer<typeof ProjectHealthStatusSchema>;

/** Filter for `listProjectHealth` (default: every checked project). */
export const ProjectHealthQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
});
export type ProjectHealthQuery = z.infer<typeof ProjectHealthQuerySchema>;

/** `analyzeProjectHealth` response — the investigation task it created. */
export const AnalyzeProjectHealthResultSchema = z.object({
  taskId: z.string().min(1),
});
export type AnalyzeProjectHealthResult = z.infer<typeof AnalyzeProjectHealthResultSchema>;
