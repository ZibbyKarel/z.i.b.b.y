import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  CreateProjectSchema,
  ProjectIdSchema,
  ProjectProfileSchema,
  ProjectSchema,
  ProjectSecretsInputSchema,
  ProjectStandupSchema,
  UpdateProjectProfileSchema,
  UpdateProjectSchema,
} from "./project.schema";

const c = initContract();

/**
 * CRUD over the project registry — the catalog of target directories agents and
 * skills run against. Mirrors `skillsContract`; the backend implements it via
 * `@ts-rest/nest` against a JSON-manifest-backed storage service (projects are a
 * registry, not files). `listProjects` (`GET /projects`) and the categories
 * sub-resource (`GET /projects/categories`) are both more specific than
 * `GET /projects/:id`, so the categories controller is mounted first.
 */
export const projectsContract = c.router(
  {
    createProject: {
      method: "POST",
      path: "/projects",
      body: CreateProjectSchema,
      responses: { 201: ProjectSchema, 409: ErrorSchema },
      summary: "Create a new project",
    },
    listProjects: {
      method: "GET",
      path: "/projects",
      responses: { 200: z.array(ProjectSchema) },
      summary: "List all projects",
    },
    // Declared before `getProject` so `/projects/search` is matched as its own
    // route rather than captured by the `/projects/:id` param.
    searchProjects: {
      method: "GET",
      path: "/projects/search",
      query: z.object({ q: z.string() }),
      responses: { 200: z.array(ProjectSchema) },
      summary: "Search projects by id, name, desc, path or category",
    },
    getProject: {
      method: "GET",
      path: "/projects/:id",
      pathParams: z.object({ id: ProjectIdSchema }),
      responses: { 200: ProjectSchema, 404: ErrorSchema },
      summary: "Get a single project by id",
    },
    updateProject: {
      method: "PATCH",
      path: "/projects/:id",
      pathParams: z.object({ id: ProjectIdSchema }),
      body: UpdateProjectSchema,
      responses: { 200: ProjectSchema, 404: ErrorSchema },
      summary: "Partially update an existing project",
    },
    deleteProject: {
      method: "DELETE",
      path: "/projects/:id",
      pathParams: z.object({ id: ProjectIdSchema }),
      responses: { 200: z.object({ id: ProjectIdSchema }), 404: ErrorSchema },
      summary: "Delete a project (removes only the registry record; files on disk are untouched)",
    },
    setProjectSecrets: {
      method: "PUT",
      path: "/projects/:id/secrets",
      pathParams: z.object({ id: ProjectIdSchema }),
      body: ProjectSecretsInputSchema,
      responses: { 200: ProjectSchema, 404: ErrorSchema },
      summary: "Set a project's run secrets (write-only; never read back)",
    },
    deleteProjectSecrets: {
      method: "DELETE",
      path: "/projects/:id/secrets",
      pathParams: z.object({ id: ProjectIdSchema }),
      responses: { 200: ProjectSchema, 404: ErrorSchema },
      summary: "Remove a project's stored run secrets",
    },
    getProjectProfile: {
      method: "GET",
      path: "/projects/:id/profile",
      pathParams: z.object({ id: ProjectIdSchema }),
      responses: { 200: ProjectProfileSchema, 404: ErrorSchema },
      summary: "Get the operational profile (identity, autonomy policy, daily rhythm) of a project",
    },
    updateProjectProfile: {
      method: "PUT",
      path: "/projects/:id/profile",
      pathParams: z.object({ id: ProjectIdSchema }),
      body: UpdateProjectProfileSchema,
      responses: { 200: ProjectProfileSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Replace the operational profile of a project",
    },
    getStandup: {
      method: "GET",
      path: "/projects/:id/standup",
      pathParams: z.object({ id: ProjectIdSchema }),
      responses: { 200: ProjectStandupSchema, 404: ErrorSchema },
      summary: "Get the latest standup cheat sheet for a project (generates on first call)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ProjectsContract = typeof projectsContract;
