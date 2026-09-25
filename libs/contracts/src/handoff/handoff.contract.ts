import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  ChainInputSchema,
  ChainSchema,
  HandoffRuleInputSchema,
  HandoffRuleSchema,
  HandoffSignalKindInputSchema,
  HandoffSignalKindSchema,
} from "./handoff.schema";

const c = initContract();

/**
 * Cross-department handoff rules (design doc
 * `docs/superpowers/specs/2026-07-22-department-handoff-design.md`, Part A). Full
 * CRUD over the file-backed rule set (`HandoffRuleStore`, A2): the seeded system
 * rules (`system: true`) can be retuned but never deleted — a delete of a system
 * rule is a 403, mirrored by `HandoffRuleStore.delete`.
 */
export const handoffContract = c.router(
  {
    getHandoffRules: {
      method: "GET",
      path: "/handoff-rules",
      /**
       * D-005 — a chain's rules are hidden by default (`includeChains` defaults
       * false server-side): the generic rule editor must never let an operator
       * half-edit a chain's route row by row (a chain's own PUT is the only
       * atomic writer of its rules). `"true"`/`"false"` as a plain string —
       * `z.coerce.boolean()` would coerce the STRING `"false"` to `true`.
       */
      query: z.object({ includeChains: z.string().optional() }),
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

    listSignalKinds: {
      method: "GET",
      path: "/handoff-signal-kinds",
      responses: {
        200: HandoffSignalKindSchema.array(),
      },
      summary: "List all registered handoff signal kinds (built-ins + operator-registered)",
    },
    createSignalKind: {
      method: "POST",
      path: "/handoff-signal-kinds",
      body: HandoffSignalKindInputSchema,
      responses: {
        201: z.object({ signalKind: HandoffSignalKindSchema, buildTaskId: z.string() }),
      },
      summary:
        "Register a new operator-authored signal kind (status: pending) and spawn a Dev build task to implement its emit",
    },
    updateSignalKind: {
      method: "PATCH",
      path: "/handoff-signal-kinds/:id",
      pathParams: z.object({ id: z.string().min(1) }),
      body: HandoffSignalKindInputSchema,
      responses: { 200: HandoffSignalKindSchema, 403: ErrorSchema, 404: ErrorSchema },
      summary: "Edit an operator-authored signal kind in place (a built-in kind is a 403)",
    },
    deleteSignalKind: {
      method: "DELETE",
      path: "/handoff-signal-kinds/:id",
      pathParams: z.object({ id: z.string().min(1) }),
      responses: { 200: z.object({ id: z.string().min(1) }), 404: ErrorSchema, 403: ErrorSchema },
      summary: "Remove an operator-authored signal kind (a built-in kind cannot be deleted)",
    },

    /**
     * ZB-05a / D-005 — chains: a view over the same rule/signal-kind stores above,
     * not a new store (see `chain-view.ts`'s `deriveChain`). A chain's rules are
     * excluded from `getHandoffRules`'s default listing (D-005 cost).
     */
    listChains: {
      method: "GET",
      path: "/handoff/chains",
      responses: { 200: ChainSchema.array() },
      summary:
        "List every chain (a signal kind with chain: true, its route derived from the rule set)",
    },
    getChain: {
      method: "GET",
      path: "/handoff/chains/:id",
      pathParams: z.object({ id: z.string().min(1) }),
      responses: { 200: ChainSchema, 404: ErrorSchema },
      summary: "One chain by id",
    },
    putChain: {
      method: "PUT",
      path: "/handoff/chains/:id",
      pathParams: z.object({ id: z.string().min(1) }),
      body: ChainInputSchema,
      responses: { 200: ChainSchema, 400: ErrorSchema },
      summary:
        "Create or replace a chain: atomically rewrites its signal kind AND exactly its own rules",
    },
    deleteChain: {
      method: "DELETE",
      path: "/handoff/chains/:id",
      pathParams: z.object({ id: z.string().min(1) }),
      responses: { 200: z.object({ id: z.string().min(1) }), 404: ErrorSchema, 409: ErrorSchema },
      summary: "Remove a chain (409 while a non-terminal parent task still references it)",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type HandoffContract = typeof handoffContract;
