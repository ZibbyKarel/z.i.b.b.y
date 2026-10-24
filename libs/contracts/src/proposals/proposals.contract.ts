import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { DecideProposalInputSchema, ProposalSchema } from "./proposal.schema";

const c = initContract();

/**
 * System proposals (TODO 14) — the structured records `pattern-extract`,
 * `gap-detect` and `agent-factory` write. Producers own creation; the operator
 * only reviews: list the open ones, dismiss or edit one. Producers respect the
 * decision on their next run.
 */
export const proposalsContract = c.router(
  {
    listProposals: {
      method: "GET",
      path: "/proposals",
      responses: { 200: z.array(ProposalSchema) },
      summary: "Open, unexpired proposals — confidence high first, then most recently seen",
    },
    decideProposal: {
      method: "PATCH",
      path: "/proposals/:id",
      body: DecideProposalInputSchema,
      responses: {
        200: ProposalSchema,
        404: ErrorSchema,
        /** Edit of an agent-factory proposal, or any action on a dismissed one. */
        409: ErrorSchema,
      },
      summary: "Dismiss a proposal or edit its wording",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ProposalsContract = typeof proposalsContract;
