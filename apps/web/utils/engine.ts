import {
  type AiEngine,
  MODEL_TIERS,
  type ModelTier,
  type OpencodeTierModels,
  resolveTierModel,
} from "@zibby/contracts";

/** "opencode · provider/model" for a run that carries an engine; `undefined` for plain Claude runs. */
export function formatEngine(engine?: string, model?: string): string | undefined {
  return engine ? (model ? `${engine} · ${model}` : engine) : undefined;
}

/** The native Claude model a tier is passed to as `--model`. */
const CLAUDE_TIER_NAME: Record<ModelTier, string> = {
  haiku: "Haiku",
  sonnet: "Sonnet",
  opus: "Opus",
  fable: "Fable",
};

/**
 * The concrete model a tier runs on for an engine: the Claude name natively, the resolved
 * opencode `provider/model` otherwise (`""` when nothing is mapped and no default is set).
 */
export function tierConcreteModel(
  tier: ModelTier,
  engine: AiEngine,
  tierModels: OpencodeTierModels | undefined,
  fallback: string,
): string {
  return engine === "claude"
    ? CLAUDE_TIER_NAME[tier]
    : resolveTierModel(tier, tierModels, fallback);
}

/** 1-based level number of a tier (haiku = 1 … fable = 4). */
export const tierLevel = (tier: ModelTier): number => MODEL_TIERS.indexOf(tier) + 1;
