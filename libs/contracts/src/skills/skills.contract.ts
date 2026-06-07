import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "../common.schema"
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

// A skill is not an autonomous executable — it's a capability an agent invokes
// from its delegatable catalog, so there is no standalone "skill run" contract.
// (Contrast `agentRunsContract`/`pipelineRunsContract`, which are real runners.)
