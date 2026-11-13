import { z } from "zod";

/** One provider's status — the key itself is write-only; only its last 4 chars are echoed. */
export const AiProviderStatusSchema = z.object({
  configured: z.boolean(),
  keyHint: z.string().optional(),
});
export type AiProviderStatus = z.infer<typeof AiProviderStatusSchema>;

/** BlueCode (team.blue's LLM gateway): the key hint plus the saved gateway URL and model count. */
export const BlueCodeStatusSchema = AiProviderStatusSchema.extend({
  baseUrl: z.string().optional(),
  modelCount: z.number().int().nonnegative().optional(),
});
export type BlueCodeStatus = z.infer<typeof BlueCodeStatusSchema>;

export const AiProvidersStatusSchema = z.object({
  openai: AiProviderStatusSchema,
  bluecode: BlueCodeStatusSchema,
});
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

/**
 * A19 — engine-independent model tiers, cheapest first (haiku = 1 … fable = 4). The
 * names are Claude's CLI aliases, so the claude engine passes a tier as `--model`
 * unchanged; opencode maps it through `SystemConfig.opencodeTierModels`.
 */
export const MODEL_TIERS = ["haiku", "sonnet", "opus", "fable"] as const;
export const ModelTierSchema = z.enum(MODEL_TIERS);
export type ModelTier = z.infer<typeof ModelTierSchema>;

/** A20 — the opencode `provider/model[#variant]` each tier runs on (unmapped = absent). */
export const OpencodeTierModelsSchema = z
  .object({
    haiku: z.string().min(1).optional(),
    sonnet: z.string().min(1).optional(),
    opus: z.string().min(1).optional(),
    fable: z.string().min(1).optional(),
  })
  .strict();
export type OpencodeTierModels = z.infer<typeof OpencodeTierModelsSchema>;

/**
 * A20 — the opencode model a tier runs on: its own mapping, else the nearest mapped
 * LOWER tier, else the nearest mapped HIGHER tier, else `fallback` (the global
 * `opencodeModel`). No tier → `fallback`. "" means nothing is chosen at all.
 * A tier counts when mapped AND (with `listed`, the live catalog) its model is listed —
 * a family without that model falls back like an unmapped tier (todo-7). An absent or
 * empty `listed` means the catalog is unreadable: the mapping is trusted.
 */
export function resolveTierModel(
  tier: ModelTier | undefined,
  tierModels: OpencodeTierModels | undefined,
  fallback: string,
  listed?: readonly string[],
): string {
  if (!tier || !tierModels) return fallback;
  const i = MODEL_TIERS.indexOf(tier);
  const order = [
    ...MODEL_TIERS.slice(0, i + 1).reverse(), // itself, then downwards
    ...MODEL_TIERS.slice(i + 1), // then upwards
  ];
  for (const t of order) {
    const model = tierModels[t];
    if (model && (!listed?.length || listed.includes(model.split("#")[0] ?? model))) return model;
  }
  return fallback;
}

/**
 * A31 — a model family is an opencode provider id: claude → `claude-agent`, openai →
 * `openai`, opencode → `opencode` (the free models), bluecode → `bluecode` (team.blue's
 * gateway, a custom opencode provider). Picking one presets the tier models
 * and the default model.
 */
export const MODEL_FAMILIES = ["claude", "openai", "opencode", "bluecode"] as const;
export const ModelFamilySchema = z.enum(MODEL_FAMILIES);
export type ModelFamily = z.infer<typeof ModelFamilySchema>;

export const MODEL_FAMILY_PROVIDER: Record<ModelFamily, string> = {
  claude: "claude-agent",
  openai: "openai",
  opencode: "opencode",
  bluecode: "bluecode",
};

/**
 * Preferred model per tier (weakest → strongest) and the default model of each family.
 * claude: the `claude-agent` aliases. openai: `OPENAI_TEXT_MODELS` (cheapest first); the
 * catalog lists no openai model before `opencode auth login openai`, so these ids are
 * unverified against opencode until then. opencode: the free `opencode/*` catalog, ordered
 * by judgment (lightning/small → larger context and output), not benchmarked.
 */
export const MODEL_FAMILY_PRESETS: Record<
  ModelFamily,
  { tiers: Record<ModelTier, string>; default: string }
> = {
  claude: {
    tiers: {
      haiku: "claude-agent/haiku",
      sonnet: "claude-agent/sonnet",
      opus: "claude-agent/opus",
      fable: "claude-agent/fable",
    },
    default: "claude-agent/sonnet",
  },
  openai: {
    tiers: {
      haiku: "openai/gpt-6-luna",
      sonnet: "openai/gpt-6.1-terra",
      opus: "openai/gpt-6.1-sol",
      fable: "openai/gpt-6-astra",
    },
    default: "openai/gpt-6.1-terra",
  },
  opencode: {
    tiers: {
      haiku: "opencode/nemotron-3.5-lightning-free",
      sonnet: "opencode/glm-5.3-flash-free",
      opus: "opencode/minimax-m3.1-flash-free",
      fable: "opencode/nemotron-3.5-super-vl-free",
    },
    default: "opencode/glm-5.3-flash-free",
  },
  bluecode: {
    tiers: {
      haiku: "bluecode/llmfactory:local:GLM-5.3-Flash",
      sonnet: "bluecode/llmfactory:local:DeepSeek-V4.1-Flash",
      opus: "bluecode/llmfactory:local:GLM-5.3",
      fable: "bluecode/llmfactory:local:Kimi-K3.1-Pro",
    },
    default: "bluecode/llmfactory:local:GLM-5.3",
  },
};

/**
 * A31 — the config fields a family pick writes. With a readable catalog (`catalogIds`), a
 * tier whose preferred id is not listed stays unset (`resolveTierModel` then falls back),
 * and a missing default falls back to the resolved tier 2; with `undefined` (catalog
 * unreadable) the preset is written as is. The native engine is never written back on.
 */
export function applyModelFamily(
  family: ModelFamily,
  catalogIds: readonly string[] | undefined,
): {
  aiEngine: "opencode";
  modelFamily: ModelFamily;
  opencodeModel: string;
  opencodeTierModels: OpencodeTierModels;
} {
  const preset = MODEL_FAMILY_PRESETS[family];
  const listed = (id: string) => !catalogIds || catalogIds.includes(id);
  const opencodeTierModels: OpencodeTierModels = {};
  for (const tier of MODEL_TIERS)
    if (listed(preset.tiers[tier])) opencodeTierModels[tier] = preset.tiers[tier];
  const opencodeModel = listed(preset.default)
    ? preset.default
    : resolveTierModel("sonnet", opencodeTierModels, "");
  return { aiEngine: "opencode", modelFamily: family, opencodeModel, opencodeTierModels };
}

/** One engine's availability, from `GET /api/ai-providers/engines`. */
/**
 * One opencode model. `free`: provider `opencode` with an all-zero price list in
 * opencode's model catalog (or, without a catalog, an `opencode/…-free` id).
 * `subscription`: provider `claude-agent` with an empty price list — covered by the
 * operator's Claude login, so neither free nor paid per token. `variants`: the
 * catalog's variant ids (A26 — a run's `thinking` level selects the variant of the same
 * id, so a model listing `low`/`medium`/`high` supports thinking); `[]` = none / unknown.
 */
export const AiEngineModelSchema = z.object({
  id: z.string(),
  free: z.boolean(),
  subscription: z.boolean(),
  variants: z.array(z.string()).default([]),
});
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

function isPlainHttpsUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
  } catch {
    return false;
  }
}

/**
 * Save BlueCode: the project's gateway URL (`https://…/projects/<id>/v1`) and its key.
 * Omitting `apiKey` keeps the stored one and only refreshes the model list.
 */
export const SetBlueCodeInputSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .refine(isPlainHttpsUrl, {
      message: "must be an https URL without credentials, query or fragment",
    })
    // Normalise from the parsed URL: a bare trailing `?` / `#` and slashes drop out.
    .transform((v) => {
      const u = new URL(v);
      return (u.origin + u.pathname).replace(/\/+$/, "");
    })
    .refine((v) => v.endsWith("/v1"), {
      message: "the base URL must end with /v1, e.g. https://bluecode.ai.team.blue/projects/ID/v1",
    }),
  apiKey: z.string().trim().min(20).optional(),
});
export type SetBlueCodeInput = z.infer<typeof SetBlueCodeInputSchema>;
