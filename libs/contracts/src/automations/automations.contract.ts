import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { AgentIdSchema } from "../agents/agent.schema"
import { ErrorSchema } from "../common.schema"
import {
  AutomationSchema,
  CreateAutomationSchema,
  UpdateAutomationSchema,
} from "./automation.schema"

const c = initContract()

const IdParam = z.object({ id: AgentIdSchema })

/**
 * Automations (Phase 5): cron/event triggers that start a target run unprompted.
 * `trigger` runs the target immediately (the manual/event path, and what tests
 * drive deterministically); the cron scheduler fires the same path on schedule.
 */
export const automationsContract = c.router(
  {
    createAutomation: {
      method: "POST",
      path: "/automations",
      body: CreateAutomationSchema,
      responses: { 201: AutomationSchema, 409: ErrorSchema },
      summary: "Create an automation",
    },
    listAutomations: {
      method: "GET",
      path: "/automations",
      responses: { 200: z.array(AutomationSchema) },
      summary: "List automations",
    },
    getAutomation: {
      method: "GET",
      path: "/automations/:id",
      pathParams: IdParam,
      responses: { 200: AutomationSchema, 404: ErrorSchema },
      summary: "Get an automation by id",
    },
    updateAutomation: {
      method: "PATCH",
      path: "/automations/:id",
      pathParams: IdParam,
      body: UpdateAutomationSchema,
      responses: { 200: AutomationSchema, 404: ErrorSchema },
      summary: "Update an automation (enable/disable, retarget)",
    },
    deleteAutomation: {
      method: "DELETE",
      path: "/automations/:id",
      pathParams: IdParam,
      responses: { 200: z.object({ id: AgentIdSchema }), 404: ErrorSchema },
      summary: "Delete an automation",
    },
    triggerAutomation: {
      method: "POST",
      path: "/automations/:id/trigger",
      pathParams: IdParam,
      body: z.object({}).optional(),
      responses: { 200: z.object({ runRef: z.string() }), 404: ErrorSchema },
      summary: "Fire an automation now (runs its target, returns a run reference)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type AutomationsContract = typeof automationsContract
