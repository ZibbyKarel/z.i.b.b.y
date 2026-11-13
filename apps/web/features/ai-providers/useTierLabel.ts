"use client";

import { useTranslations } from "next-intl";
import type { AiEngine, ModelTier } from "@zibby/contracts";
import { tierConcreteModel } from "../../utils/engine";
import { useSystemConfigQuery } from "../system";

/**
 * Returns `(tier, engine?) => "Sonnet"` — the concrete model name of a tier, with no tier label
 * (tiers are shown only in Settings → AI Engine). `engine` defaults to the global engine; on
 * opencode the model is the tier's mapping (or "not set" when nothing resolves). `short` (canvas
 * badges) drops the opencode provider prefix: "beam-free".
 */
export function useTierLabel(): (tier: ModelTier, engine?: AiEngine, short?: boolean) => string {
  const t = useTranslations("aiEngine");
  const config = useSystemConfigQuery().data;
  return (tier, engine, short = false) => {
    const model = tierConcreteModel(
      tier,
      engine ?? config?.aiEngine ?? "claude",
      config?.opencodeTierModels,
      config?.opencodeModel ?? "",
    );
    return (short ? model.split("/").pop() : model) || t("notSet");
  };
}
