import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { RunLogChunkSchema } from "../agent-runs/agent-run.schema"
import { ErrorSchema } from "../common.schema"
import { SkillRunSchema, StartSkillRunSchema } from "./skill-run.schema"
import { CreateSkillSchema, SkillIdSchema, SkillSchema, UpdateSkillSchema } from "./skill.schema"

const c = initContract()

/**
 * CRUD over skill definitions (SKILL.md files). Mirrors `agentsContract`; the
 * backend implements it via `@ts-rest/nest` against a file-backed storage service.
 */
export const skillsContract = c.router(
  {
    createSkill: {
      method: "POST",
      path: "/skills",
      body: CreateSkillSchema,
      responses: { 201: SkillSchema, 409: ErrorSchema },
      summary: "Create a new skill",
    },
    listSkills: {
      method: "GET",
      path: "/skills",
      responses: { 200: z.array(SkillSchema) },
      summary: "List all skills",
    },
    getSkill: {
      method: "GET",
      path: "/skills/:id",
      pathParams: z.object({ id: SkillIdSchema }),
      responses: { 200: SkillSchema, 404: ErrorSchema },
      summary: "Get a single skill by id",
    },
    updateSkill: {
      method: "PATCH",
      path: "/skills/:id",
      pathParams: z.object({ id: SkillIdSchema }),
      body: UpdateSkillSchema,
      responses: { 200: SkillSchema, 404: ErrorSchema },
      summary: "Partially update an existing skill",
    },
    deleteSkill: {
      method: "DELETE",
      path: "/skills/:id",
      pathParams: z.object({ id: SkillIdSchema }),
      responses: { 200: z.object({ id: SkillIdSchema }), 404: ErrorSchema },
      summary: "Delete a skill",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type SkillsContract = typeof skillsContract

/**
 * Skill execution — the runtime side of the skills resource, sharing the
 * `/api/skills/*` URL space but kept separate from CRUD. Logs are polled by byte
 * offset, same as agent runs.
 */
export const skillRunsContract = c.router(
  {
    startSkillRun: {
      method: "POST",
      path: "/skills/:id/run",
      pathParams: z.object({ id: SkillIdSchema }),
      body: StartSkillRunSchema,
      responses: { 201: SkillRunSchema, 404: ErrorSchema },
      summary: "Start a run of a skill",
    },
    listRunningSkills: {
      method: "GET",
      path: "/skills/running",
      responses: { 200: z.array(SkillRunSchema) },
      summary: "List currently running (and just-finished) skill runs",
    },
    getSkillRun: {
      method: "GET",
      path: "/skills/runs/:runId",
      pathParams: z.object({ runId: z.string() }),
      responses: { 200: SkillRunSchema, 404: ErrorSchema },
      summary: "Get a single skill run by id",
    },
    getSkillRunLogs: {
      method: "GET",
      path: "/skills/runs/:runId/logs",
      pathParams: z.object({ runId: z.string() }),
      query: z.object({ offset: z.coerce.number().int().nonnegative().optional() }),
      responses: { 200: RunLogChunkSchema, 404: ErrorSchema },
      summary: "Read a skill run's log from a byte offset",
    },
    stopSkillRun: {
      method: "POST",
      path: "/skills/runs/:runId/stop",
      pathParams: z.object({ runId: z.string() }),
      body: z.object({}).optional(),
      responses: { 200: SkillRunSchema, 404: ErrorSchema },
      summary: "Stop a running skill",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type SkillRunsContract = typeof skillRunsContract
