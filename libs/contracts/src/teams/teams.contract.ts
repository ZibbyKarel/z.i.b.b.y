import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { CreateTeamSchema, TeamIdSchema, TeamSchema, UpdateTeamSchema } from "./team.schema";

const c = initContract();

/**
 * CRUD over the team registry — the layer between Company and Project that owns
 * a read-only knowledge base. Mirrors `companiesContract` verbatim in shape: the
 * backend implements it via `@ts-rest/nest` against a JSON-manifest-backed
 * storage service (teams are a registry, not files). `searchTeams`
 * (`GET /teams/search`) is declared before `getTeam` (`GET /teams/:id`) so it is
 * matched as its own route rather than captured by the `:id` param.
 */
export const teamsContract = c.router(
  {
    createTeam: {
      method: "POST",
      path: "/teams",
      body: CreateTeamSchema,
      responses: { 201: TeamSchema, 409: ErrorSchema },
      summary: "Create a new team",
    },
    listTeams: {
      method: "GET",
      path: "/teams",
      responses: { 200: z.array(TeamSchema) },
      summary: "List all teams",
    },
    // Declared before `getTeam` so `/teams/search` is matched as its own route
    // rather than captured by the `/teams/:id` param.
    searchTeams: {
      method: "GET",
      path: "/teams/search",
      query: z.object({ q: z.string().min(1) }),
      responses: { 200: z.array(TeamSchema) },
      summary: "Search teams by id, name or desc",
    },
    getTeam: {
      method: "GET",
      path: "/teams/:id",
      pathParams: z.object({ id: TeamIdSchema }),
      responses: { 200: TeamSchema, 404: ErrorSchema },
      summary: "Get a single team by id",
    },
    updateTeam: {
      method: "PATCH",
      path: "/teams/:id",
      pathParams: z.object({ id: TeamIdSchema }),
      body: UpdateTeamSchema,
      responses: { 200: TeamSchema, 404: ErrorSchema },
      summary: "Partially update an existing team",
    },
    deleteTeam: {
      method: "DELETE",
      path: "/teams/:id",
      pathParams: z.object({ id: TeamIdSchema }),
      responses: { 200: z.object({ id: TeamIdSchema }), 404: ErrorSchema },
      summary: "Delete a team (allowed even with linked projects — they keep a dangling teamId)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type TeamsContract = typeof teamsContract;
