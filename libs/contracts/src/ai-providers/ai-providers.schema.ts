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

/**
 * What ZIBBY itself spent through each provider's API in the current month
 * (Europe/Prague). OpenAI exposes no remaining-credit endpoint, so this is spend only.
 */
export const AiProvidersSpendSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  openai: z.object({ spentUsd: z.number().nonnegative() }),
});
export type AiProvidersSpend = z.infer<typeof AiProvidersSpendSchema>;

/**
 * Which CLI runs an agent / workflow agent stage: the native `claude` CLI (the
 * Claude subscription) or `opencode run` with an operator-chosen `provider/model`.
 * See docs/api/ai-engines.md.
 */
export const AiEngineSchema = z.enum(["claude", "opencode"]);
export type AiEngine = z.infer<typeof AiEngineSchema>;

/** One engine's availability, from `GET /api/ai-providers/engines`. */
/**
 * One opencode model. `free` is true for an `opencode/…-free` id (the opencode
 * provider's free tier naming) or a model `opencode stats` shows used at zero cost.
 */
export const AiEngineModelSchema = z.object({ id: z.string(), free: z.boolean() });
export type AiEngineModel = z.infer<typeof AiEngineModelSchema>;

export const AiEngineStatusSchema = z.object({
  id: AiEngineSchema,
  available: z.boolean(),
  /** CLI version string; absent when the binary is missing. */
  version: z.string().optional(),
  /** opencode only: providers with stored credentials (`opencode auth list`) + model prefixes. */
  providers: z.array(z.string()).optional(),
  /** opencode only: every `provider/model` id `opencode models` lists. */
  models: z.array(AiEngineModelSchema).optional(),
});
export type AiEngineStatus = z.infer<typeof AiEngineStatusSchema>;

export const AiEnginesSchema = z.object({ engines: z.array(AiEngineStatusSchema) });
export type AiEngines = z.infer<typeof AiEnginesSchema>;

/** Recorded usage (no quota — opencode exposes none). */
export const AiUsageSchema = z.object({
  steps: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
  tokens: z.object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    reasoning: z.number().nonnegative(),
    cacheRead: z.number().nonnegative(),
    cacheWrite: z.number().nonnegative(),
  }),
});
export type AiUsage = z.infer<typeof AiUsageSchema>;

/** `GET /api/ai-providers/usage?days=N` — opencode usage per `provider/model`. */
export const AiProvidersUsageSchema = z.object({
  days: z.number().int().positive(),
  opencode: z.object({
    available: z.boolean(),
    totals: AiUsageSchema,
    models: z.array(
      AiUsageSchema.extend({
        providerId: z.string(),
        modelId: z.string(),
        variant: z.string().optional(),
      }),
    ),
  }),
});
export type AiProvidersUsage = z.infer<typeof AiProvidersUsageSchema>;

export const AiProvidersUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const SetOpenAiKeyInputSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20)
    .refine((v) => v.startsWith("sk-"), { message: 'must start with "sk-"' }),
});
export type SetOpenAiKeyInput = z.infer<typeof SetOpenAiKeyInputSchema>;
