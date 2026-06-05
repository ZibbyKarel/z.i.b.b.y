import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "../common.schema"
import {
  CreateProjectSchema,
  ProjectIdSchema,
  ProjectSchema,
  UpdateProjectSchema,
} from "./project.schema"

const c = initContract()

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
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type ProjectsContract = typeof projectsContract
