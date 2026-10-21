import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { GateRuleIdSchema, GlobalGateRuleInputSchema, GlobalGateRuleSchema } from "./gate.schema";

const c = initContract();

/**
 * The global gate rules — the gates board. One list holding the built-in system
 * rules (`system: true`, not deletable) and the operator's own; untagged rules apply
 * to every run (strictest match wins), an agent's own rules can only tighten them.
 * CRUD plus `reorder` (order only matters within a department's bucket).
 */
export const gateRulesContract = c.router(
  {
    listGateRules: {
      method: "GET",
      path: "/gate-rules",
      responses: { 200: z.object({ rules: z.array(GlobalGateRuleSchema) }) },
      summary: "List the global gate-rule catalog (ordered, first match wins)",
    },
    createGateRule: {
      method: "POST",
      path: "/gate-rules",
      body: GlobalGateRuleInputSchema,
      responses: { 201: GlobalGateRuleSchema, 422: ErrorSchema },
      summary: "Add a rule to the catalog (appended to the end)",
    },
    reorderGateRules: {
      method: "POST",
      path: "/gate-rules/reorder",
      body: z.object({ ids: z.array(GateRuleIdSchema) }),
      responses: { 200: z.object({ rules: z.array(GlobalGateRuleSchema) }), 422: ErrorSchema },
      summary: "Reorder the catalog by a full list of rule ids",
    },
    updateGateRule: {
      method: "PUT",
      path: "/gate-rules/:id",
      pathParams: z.object({ id: GateRuleIdSchema }),
      body: GlobalGateRuleInputSchema,
      responses: { 200: GlobalGateRuleSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Edit a catalog rule in place (keeps its id and position)",
    },
    deleteGateRule: {
      method: "DELETE",
      path: "/gate-rules/:id",
      pathParams: z.object({ id: GateRuleIdSchema }),
      responses: { 200: z.object({ id: GateRuleIdSchema }), 404: ErrorSchema, 409: ErrorSchema },
      summary: "Remove a catalog rule (409 for a built-in system rule)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type GateRulesContract = typeof gateRulesContract;
