import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { HandoffRuleInputSchema, HandoffRuleSchema } from "./handoff.schema";

const c = initContract();

/**
 * Cross-subsystem handoff rules (design doc
 * `docs/superpowers/specs/2026-07-22-subsystem-handoff-design.md`, Part A). Full
 * CRUD over the file-backed rule set (`HandoffRuleStore`, A2): the seeded system
 * rules (`system: true`) can be retuned but never deleted — a delete of a system
 * rule is a 403, mirrored by `HandoffRuleStore.delete`.
 */
export const handoffContract = c.router(
  {
    getHandoffRules: {
      method: "GET",
      path: "/handoff-rules",
      responses: {
        200: HandoffRuleSchema.array(),
      },
      summary: "List all standing handoff rules (seeded system rules + operator-authored ones)",
    },
    createHandoffRule: {
      method: "POST",
      path: "/handoff-rules",
      body: HandoffRuleInputSchema,
      responses: { 201: HandoffRuleSchema },
      summary: "Add an operator-authored handoff rule",
    },
    updateHandoffRule: {
      method: "PUT",
      path: "/handoff-rules/:id",
      pathParams: z.object({ id: z.string().min(1) }),
      body: HandoffRuleInputSchema,
      responses: { 200: HandoffRuleSchema, 404: ErrorSchema },
      summary: "Edit a handoff rule in place (keeps its id and system flag)",
    },
    deleteHandoffRule: {
      method: "DELETE",
      path: "/handoff-rules/:id",
      pathParams: z.object({ id: z.string().min(1) }),
      responses: { 200: z.object({ id: z.string().min(1) }), 404: ErrorSchema, 403: ErrorSchema },
      summary: "Remove an operator-authored handoff rule (a system rule cannot be deleted)",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type HandoffContract = typeof handoffContract;
