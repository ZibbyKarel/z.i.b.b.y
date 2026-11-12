"use client";

import { useTranslations } from "next-intl";
import type { AiEngine, ModelTier } from "@zibby/contracts";
import { tierConcreteModel, tierLevel } from "../../utils/engine";
import { useSystemConfigQuery } from "../system";

/**
 * Returns `(tier, engine?) => "Level 2 · Sonnet"` — the one label for a model tier. `engine`
 * defaults to the global engine; on opencode the concrete model is the tier's mapping
 * (or "not set" when nothing resolves). `short` (canvas badges) reads "L2 · beam-free": the
 * level shortened and the opencode provider prefix dropped.
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
    const name = (short ? model.split("/").pop() : model) || t("notSet");
    return `${t(short ? "levelShort" : "level", { n: tierLevel(tier) })} · ${name}`;
  };
}
