import { initContract } from "@ts-rest/core";
import { SelfKnowledgeSchema } from "./self-knowledge.schema";

const c = initContract();

/**
 * Self-Knowledge contract (Fáze 1). A single read endpoint: the current
 * machine-generated snapshot plus whether the vault note has drifted from it.
 * Writing/regenerating the note is a CLI concern (`tools/self-knowledge/generate.ts`),
 * not an HTTP mutation — there is intentionally no POST here.
 */
export const selfKnowledgeContract = c.router(
  {
    getSelfKnowledge: {
      method: "GET",
      path: "/self-knowledge",
      responses: {
        200: SelfKnowledgeSchema,
      },
      summary: "Machine-generated self-knowledge snapshot (agents, pipelines, gate rules, channels)",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type SelfKnowledgeContract = typeof selfKnowledgeContract;
