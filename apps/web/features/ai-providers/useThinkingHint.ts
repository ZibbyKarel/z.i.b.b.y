"use client";

import { useTranslations } from "next-intl";
import type { AiEngine, ModelTier } from "@zibby/contracts";
import { catalogIds, lacksThinkingVariant, tierConcreteModel } from "../../utils/engine";
import { useSystemConfigQuery } from "../system";
import { useAiEnginesQuery } from "./queries";

export interface ThinkingHintInput {
  /** The agent's / step's own engine override; empty = the global engine. */
  engine?: AiEngine | "" | undefined;
  /** Exact `provider/model` override; empty = the tier's mapped model. */
  engineModel?: string | undefined;
  tier: ModelTier;
  thinking: string;
}

/**
 * The one-line "no thinking variant" hint for the thinking pickers, or `undefined` when it does
 * not apply (Claude engine, model unknown, or the model offers that level).
 */
export function useThinkingHint({
  engine,
  engineModel,
  tier,
  thinking,
}: ThinkingHintInput): string | undefined {
  const t = useTranslations("aiEngine");
  const config = useSystemConfigQuery().data;
  const engines = useAiEnginesQuery().data?.engines;
  const models = engines?.find((e) => e.id === "opencode")?.models;
  if ((engine || config?.aiEngine) !== "opencode" || !models) return undefined;
  const model =
    engineModel ||
    tierConcreteModel(
      tier,
      "opencode",
      config?.opencodeTierModels,
      config?.opencodeModel ?? "",
      catalogIds(engines),
    );
  return lacksThinkingVariant(models, model, thinking)
    ? t("noThinkingVariant", { level: thinking })
    : undefined;
}
