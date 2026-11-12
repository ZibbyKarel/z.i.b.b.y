import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { AgentIdSchema } from "../agents/agent.schema";
import { RunLogChunkSchema } from "../agents/agent-run.schema";
import { DeleteResponseSchema, EmptyBodySchema, ErrorSchema } from "../common.schema";
import {
  AutomationSchema,
  CreateAutomationSchema,
  UpdateAutomationSchema,
} from "./automation.schema";
import { AutomationFireSchema, AutomationViewSchema } from "./automation-fire.schema";

const c = initContract();

const IdParam = z.object({ id: AgentIdSchema });
const FireParams = z.object({ id: AgentIdSchema, fireId: z.string().min(1) });

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
      responses: { 200: z.array(AutomationViewSchema) },
      summary: "List automations (each with its latest fire)",
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
      responses: { 200: AutomationViewSchema, 404: ErrorSchema },
      summary: "Get an automation by id (with its latest fire)",
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
    listAutomationFires: {
      method: "GET",
      path: "/automations/:id/fires",
      pathParams: IdParam,
      responses: { 200: z.array(AutomationFireSchema), 404: ErrorSchema },
      summary:
        "List an automation's fires, newest first (live log: GET …/fires/:fireId/logs/stream, SSE)",
    },
    getAutomationFireLog: {
      method: "GET",
      path: "/automations/:id/fires/:fireId/logs",
      pathParams: FireParams,
      query: z.object({ offset: z.coerce.number().int().min(0).default(0) }),
      responses: { 200: RunLogChunkSchema, 404: ErrorSchema },
      summary: "Read a fire's log from a byte offset",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type AutomationsContract = typeof automationsContract;
