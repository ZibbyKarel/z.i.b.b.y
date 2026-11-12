import { initContract } from "@ts-rest/core";
import { EmptyBodySchema, ErrorSchema } from "../common.schema";
import { FixProjectCiResultSchema, ProjectCiSchema } from "./project-ci.schema";

const c = initContract();

/**
 * todo-10 — base-branch CI per project (the Bridge "Project status" widget). `get` is polled
 * state (cached ~60 s server-side); `fix` is the operator's click: one ordinary task with a
 * PR output, so ZIBBY opens the fix PR itself (Tier-2) and the operator merges it.
 */
export const projectCiContract = c.router(
  {
    getProjectCi: {
      method: "GET",
      path: "/project-ci/:projectId",
      responses: { 200: ProjectCiSchema, 404: ErrorSchema },
      summary: "Base-branch CI of a project: workflow runs -> jobs -> steps",
    },
    fixProjectCi: {
      method: "POST",
      path: "/project-ci/:projectId/fix",
      body: EmptyBodySchema,
      responses: {
        201: FixProjectCiResultSchema,
        404: ErrorSchema,
        /** The base branch is not red (nothing to fix) or a fix is already running. */
        409: ErrorSchema,
        /** No GitHub link / token for the project. */
        422: ErrorSchema,
      },
      summary: "Start a task that fixes the red base-branch CI and opens a PR (Tier-2)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ProjectCiContract = typeof projectCiContract;
