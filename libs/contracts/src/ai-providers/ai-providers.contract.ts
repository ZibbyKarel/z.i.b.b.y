import { initContract } from "@ts-rest/core";
import { ErrorSchema } from "../common.schema";
import { AiProvidersStatusSchema, SetOpenAiKeyInputSchema } from "./ai-providers.schema";

const c = initContract();

/**
 * Global AI provider API keys (not per-project). Keys are write-only: GET reports
 * only whether one is stored plus its last 4 characters.
 */
export const aiProvidersContract = c.router(
  {
    getAiProviders: {
      method: "GET",
      path: "/ai-providers",
      responses: { 200: AiProvidersStatusSchema },
      summary: "Which AI providers have a key configured (never the key)",
    },
    setOpenAiKey: {
      method: "PUT",
      path: "/ai-providers/openai",
      body: SetOpenAiKeyInputSchema,
      responses: { 200: AiProvidersStatusSchema, 422: ErrorSchema },
      summary: "Store the OpenAI API key; write-only",
    },
    clearOpenAiKey: {
      method: "DELETE",
      path: "/ai-providers/openai",
      body: c.noBody(),
      responses: { 200: AiProvidersStatusSchema },
      summary: "Remove the stored OpenAI API key",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);

export type AiProvidersContract = typeof aiProvidersContract;
