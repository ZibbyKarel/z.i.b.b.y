import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { GateRuleIdSchema, GlobalGateRuleInputSchema, GlobalGateRuleSchema } from "./gate.schema";

const c = initContract();

/**
 * The global gate-rule catalog — the "Pravidla schvalování" page. A flat, ordered
 * list of reusable rules (first match wins) that agents and skills link by id. It
 * is the middle policy layer: the locked system floor (`POLICY.md`) is below it and
 * an entity's own rules are above. CRUD plus an explicit `reorder` (the order is
 * meaningful, so it is a first-class operation, not a side effect of update).
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
      responses: { 201: GlobalGateRuleSchema },
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
      responses: { 200: GlobalGateRuleSchema, 404: ErrorSchema },
      summary: "Edit a catalog rule in place (keeps its id and position)",
    },
    deleteGateRule: {
      method: "DELETE",
      path: "/gate-rules/:id",
      pathParams: z.object({ id: GateRuleIdSchema }),
      responses: { 200: z.object({ id: GateRuleIdSchema }), 404: ErrorSchema },
      summary: "Remove a catalog rule",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type GateRulesContract = typeof gateRulesContract;
