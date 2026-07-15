import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { EmptyBodySchema, ErrorSchema } from "../common.schema";
import {
  MergeProjectPrBodySchema,
  MergeProjectPrResultSchema,
  ProjectPrSchema,
} from "./project-pr.schema";
import {
  CreateProjectSchema,
  ProjectIdSchema,
  ProjectLocalStateSchema,
  ProjectProfileSchema,
  ProjectSchema,
  ProjectSecretsInputSchema,
  ProjectStandupSchema,
  UpdateProjectProfileSchema,
  UpdateProjectSchema,
} from "./project.schema";
import { ResolvedProjectContextSchema } from "./resolved-project-context.schema";

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
      query: z.object({ q: z.string().min(1) }),
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
    getResolvedProject: {
      method: "GET",
      path: "/projects/:id/resolved",
      pathParams: z.object({ id: ProjectIdSchema }),
      responses: { 200: ResolvedProjectContextSchema, 404: ErrorSchema },
      summary:
        "Get a project's EFFECTIVE (company-merged) people/budget/integrations (Phase 72)",
    },
    getProjectLocalState: {
      method: "GET",
      path: "/projects/:id/local-state",
      pathParams: z.object({ id: ProjectIdSchema }),
      responses: { 200: ProjectLocalStateSchema, 404: ErrorSchema },
      summary:
        "Get THIS machine's local-clone resolution for a project (Phase 76 — path vs. cloneRoot vs. absent)",
    },
    cloneProject: {
      method: "POST",
      path: "/projects/:id/clone",
      pathParams: z.object({ id: ProjectIdSchema }),
      body: EmptyBodySchema,
      responses: {
        // 200 on a fresh clone; 409 when this machine already has the project
        // present (at `path` or `cloneRoot`) — re-cloning would be a no-op at
        // best and a collision at worst; 422 when the project has no
        // `gitRemote` to clone from.
        200: ProjectLocalStateSchema,
        404: ErrorSchema,
        409: ErrorSchema,
        422: ErrorSchema,
      },
      summary:
        "Clone a project into this machine's cloneRoot (Phase 76 — 422 without gitRemote, 409 if already present)",
    },
    getProjectPrs: {
      method: "GET",
      path: "/projects/:id/prs",
      pathParams: z.object({ id: ProjectIdSchema }),
      responses: { 200: z.array(ProjectPrSchema), 404: ErrorSchema },
      summary:
        "List open GitHub PRs for a project's linked repo (Phase 78; [] with no github link — never an error)",
    },
    mergeProjectPr: {
      method: "POST",
      path: "/projects/:id/prs/:number/merge",
      pathParams: z.object({ id: ProjectIdSchema, number: z.coerce.number().int() }),
      body: MergeProjectPrBodySchema.optional(),
      responses: {
        200: MergeProjectPrResultSchema,
        404: ErrorSchema,
        // 409: GitHub reports the PR isn't mergeable (conflicts, already merged, …).
        409: ErrorSchema,
        // 422: no github integration/token configured for this project.
        422: ErrorSchema,
      },
      summary:
        "Merge an open PR — ALWAYS an explicit operator action from the UI; ZIBBY never " +
        "auto-merges (Phase 78, CLAUDE.md Law 'Never: Auto-merge')",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ProjectsContract = typeof projectsContract;
