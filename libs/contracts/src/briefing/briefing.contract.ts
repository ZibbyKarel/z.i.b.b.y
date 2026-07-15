import { initContract } from "@ts-rest/core";
import { EmptyBodySchema } from "../common.schema";
import { BriefingSchema, GenerateBriefingResultSchema } from "./briefing.schema";

const c = initContract();

/**
 * Briefing (Phase 6.2). `GET` is a PURE read — it assembles the current briefing
 * from the record with zero side effects (the overview card calls this). `POST
 * /generate` is the only mutating route: it assembles, runs the optional
 * butler-voice pass, persists the prose to the vault, advances the cursor and
 * records a `briefing-generated` activity entry. The morning automation drives the
 * same `generate` path server-side.
 */
export const briefingContract = c.router(
  {
    getBriefing: {
      method: "GET",
      path: "/briefing",
      responses: { 200: BriefingSchema },
      summary: "Assemble the current briefing (pure read, no persistence)",
    },
    generateBriefing: {
      method: "POST",
      path: "/briefing/generate",
      body: EmptyBodySchema,
      responses: { 201: GenerateBriefingResultSchema },
      summary: "Generate, persist to the vault, and record a briefing",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type BriefingContract = typeof briefingContract;
