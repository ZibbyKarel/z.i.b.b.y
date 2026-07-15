import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { AgentIdSchema } from "../agents/agent.schema";
import { DeleteResponseSchema, EmptyBodySchema, ErrorSchema } from "../common.schema";
import {
  AutomationSchema,
  CreateAutomationSchema,
  UpdateAutomationSchema,
} from "./automation.schema";

const c = initContract();

const IdParam = z.object({ id: AgentIdSchema });

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
    // Declared before `getAutomation` so `/automations/search` is matched as its
    // own route rather than captured by the `/automations/:id` param.
    searchAutomations: {
      method: "GET",
      path: "/automations/search",
      query: z.object({ q: z.string() }),
      responses: { 200: z.array(AutomationSchema) },
      summary: "Search automations by id or name",
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
      responses: { 200: AutomationSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Update an automation (enable/disable, retarget; system: reschedule/toggle only)",
    },
    deleteAutomation: {
      method: "DELETE",
      path: "/automations/:id",
      pathParams: IdParam,
      responses: { 200: DeleteResponseSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Delete an automation (system automations cannot be deleted)",
    },
    triggerAutomation: {
      method: "POST",
      path: "/automations/:id/trigger",
      pathParams: IdParam,
      body: EmptyBodySchema,
      responses: { 200: z.object({ runRef: z.string() }), 404: ErrorSchema },
      summary: "Fire an automation now (runs its target, returns a run reference)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type AutomationsContract = typeof automationsContract;
