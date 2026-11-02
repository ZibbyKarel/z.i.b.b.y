import { z } from "zod";

/** One provider's status — the key itself is write-only; only its last 4 chars are echoed. */
export const AiProviderStatusSchema = z.object({
  configured: z.boolean(),
  keyHint: z.string().optional(),
});
export type AiProviderStatus = z.infer<typeof AiProviderStatusSchema>;

export const AiProvidersStatusSchema = z.object({ openai: AiProviderStatusSchema });
export type AiProvidersStatus = z.infer<typeof AiProvidersStatusSchema>;

/**
 * OpenAI text models a workflow agent step can run on (`openaiModel`), cheapest
 * first, with their list price in USD per 1M tokens (developers.openai.com/api/docs/pricing,
 * 2026-11). The runner bills a step from the response `usage` with these.
 */
export const OPENAI_TEXT_MODELS = [
  { id: "gpt-6-luna", inputUsd: 0.1, cachedUsd: 0.01, outputUsd: 0.5 },
  { id: "gpt-6.1-terra", inputUsd: 1, cachedUsd: 0.05, outputUsd: 5 },
  { id: "gpt-6.1-sol", inputUsd: 2, cachedUsd: 0.1, outputUsd: 10 },
  { id: "gpt-6-astra", inputUsd: 10, cachedUsd: 1, outputUsd: 50 },
] as const;
export const OpenAiTextModelSchema = z.enum([
  "gpt-6-luna",
  "gpt-6.1-terra",
  "gpt-6.1-sol",
  "gpt-6-astra",
]);
export type OpenAiTextModel = z.infer<typeof OpenAiTextModelSchema>;

export const SetOpenAiKeyInputSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20)
    .refine((v) => v.startsWith("sk-"), { message: 'must start with "sk-"' }),
});
export type SetOpenAiKeyInput = z.infer<typeof SetOpenAiKeyInputSchema>;
