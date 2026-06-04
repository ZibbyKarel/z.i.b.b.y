import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { AgentIdSchema } from "../agents/agent.schema"
import { ErrorSchema } from "../common.schema"
import {
  AgentGatesSchema,
  GateEvaluationSchema,
  GateRuleInputSchema,
  GateRuleSchema,
  IntendedActionSchema,
  PolicyViolationSchema,
} from "./gate.schema"

const c = initContract()

/**
 * The gate policy engine (Phase 3.5). A read-only system floor (`POLICY.md`,
 * locked), an agent's own rules (harden-only — a `replaceAgentGates` that weakens
 * the floor is a 422), and a dry-run `evaluate` for the UI. The runner calls the
 * same evaluator in-process; this is the thin HTTP wrapper over it.
 */
export const gatesContract = c.router(
  {
    getSystemPolicy: {
      method: "GET",
      path: "/gates/policy",
      responses: { 200: z.object({ rules: z.array(GateRuleSchema) }) },
      summary: "Read the locked system policy floor",
    },
    evaluate: {
      method: "POST",
      path: "/gates/evaluate",
      body: z.object({ agentId: AgentIdSchema.optional(), action: IntendedActionSchema }),
      responses: { 200: GateEvaluationSchema },
      summary: "Dry-run: evaluate an intended action against the floor + agent rules",
    },
    getAgentGates: {
      method: "GET",
      path: "/agents/:id/gates",
      pathParams: z.object({ id: AgentIdSchema }),
      responses: { 200: AgentGatesSchema, 404: ErrorSchema },
      summary: "Read an agent's inherited (locked) floor + own rules",
    },
    replaceAgentGates: {
      method: "PUT",
      path: "/agents/:id/gates",
      pathParams: z.object({ id: AgentIdSchema }),
      body: z.object({ gates: z.array(GateRuleInputSchema) }),
      responses: { 200: AgentGatesSchema, 404: ErrorSchema, 422: PolicyViolationSchema },
      summary: "Replace an agent's own rules (harden-only; weakening the floor is 422)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type GatesContract = typeof gatesContract
