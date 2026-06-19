import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ProposalSchema } from "./proposal.schema";

const c = initContract();

/**
 * Read-only view of discovery proposals. The gate (the `proposed-task` approvals)
 * IS the actionable inbox; this endpoint just surfaces the proposal detail (the
 * candidate text + rationale + state) for a "proposed work" view. There is no
 * dispatch endpoint here — only an approval dispatches (Law 4, *proposed ≠
 * dispatched*).
 */
export const discoveryContract = c.router(
  {
    listProposals: {
      method: "GET",
      path: "/discovery/proposals",
      responses: { 200: z.array(ProposalSchema) },
      summary: "List discovery proposals (newest first)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type DiscoveryContract = typeof discoveryContract;
