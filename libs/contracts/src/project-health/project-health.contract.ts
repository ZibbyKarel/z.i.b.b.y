import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { EmptyBodySchema, ErrorSchema } from "../common.schema";
import {
  AnalyzeProjectHealthResultSchema,
  ProjectHealthQuerySchema,
  ProjectHealthStatusSchema,
} from "./project-health.schema";

const c = initContract();

/**
 * Per-project health monitoring (TODO 11). Statuses are written only by the
 * project-health watcher (or an explicit `check`). A down project never
 * dispatches anything by itself — `analyze` is the operator's explicit click,
 * which creates one ordinary investigation task through the scheduler.
 */
export const projectHealthContract = c.router(
  {
    listProjectHealth: {
      method: "GET",
      path: "/project-health",
      query: ProjectHealthQuerySchema,
      responses: { 200: z.array(ProjectHealthStatusSchema) },
      summary: "Last known health per monitored project (checked at least once)",
    },
    analyzeProjectHealth: {
      method: "POST",
      path: "/project-health/:projectId/analyze",
      body: EmptyBodySchema,
      responses: {
        200: AnalyzeProjectHealthResultSchema,
        404: ErrorSchema,
        409: ErrorSchema,
      },
      summary: "Create an investigation task for a down project",
    },
    checkProjectHealth: {
      method: "POST",
      path: "/project-health/:projectId/check",
      body: EmptyBodySchema,
      responses: { 200: ProjectHealthStatusSchema, 404: ErrorSchema },
      summary: "Run one health check now",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ProjectHealthContract = typeof projectHealthContract;
