import {
  type AiEngine,
  type AiEngineStatus,
  type ModelTier,
  type OpencodeTierModels,
  resolveTierModel,
} from "@zibby/contracts";

/** "opencode · provider/model" for a run that carries an engine; `undefined` for plain Claude runs. */
export function formatEngine(engine?: string, model?: string): string | undefined {
  return engine ? (model ? `${engine} · ${model}` : engine) : undefined;
}

/**
 * The engine and exact model a step will really run on: the step's own override, then its
 * agent's (backend precedence `phase.engineModel ?? agent.engineModel`). `engineModel` only
 * applies on opencode; without one the tier mapping decides. `engine` undefined = global engine.
 */
export function stepEngineChoice(
  step: { engine?: AiEngine | undefined; engineModel?: string | undefined } | undefined,
  agent: { engine?: AiEngine | undefined; engineModel?: string | undefined } | undefined,
): { engine: AiEngine | undefined; engineModel: string | undefined } {
  const engine = step?.engine ?? agent?.engine;
  return {
    engine,
    engineModel: engine === "opencode" ? (step?.engineModel ?? agent?.engineModel) : undefined,
  };
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
  listed?: readonly string[],
): string {
  return engine === "claude"
    ? CLAUDE_TIER_NAME[tier]
    : resolveTierModel(tier, tierModels, fallback, listed);
}

/**
 * The model ids the catalog lists, for `resolveTierModel`'s fallback; `undefined` (trust the
 * mapping) unless opencode is available and lists at least one model.
 */
export function catalogIds(engines: AiEngineStatus[] | undefined): string[] | undefined {
  const oc = engines?.find((e) => e.id === "opencode");
  return oc?.available && oc.models?.length ? oc.models.map((m) => m.id) : undefined;
}

/**
 * Whether an opencode model lacks the `level` thinking variant, so a run would go without it.
 * An explicit `#variant` in the model string wins (never flagged); a model missing from the
 * list is unknown, not flagged.
 */
export function lacksThinkingVariant(
  models: { id: string; variants: string[] }[],
  model: string,
  level: string,
): boolean {
  if (!model || !level || model.includes("#")) return false;
  const found = models.find((m) => m.id === model);
  return found !== undefined && !found.variants.includes(level);
}
