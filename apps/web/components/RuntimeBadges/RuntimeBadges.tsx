"use client";

import { type Agent, type AgentThinking } from "@zibby/contracts";
import { Tag, type TagProps } from "@zibby/design-system";
import { useTranslations } from "next-intl";

/**
 * Generic runtime badges — the model and thinking-level tags shared by agents and
 * pipeline phases (both carry the same `model`/`thinking` runtime knobs). Domain-neutral
 * and feature-neutral: they live here, not inside either feature, so agents don't have to
 * reach into the pipelines canvas for them.
 */

/** Per-run model badge (opus / sonnet / haiku …). */
export function ModelBadge({ model }: { model: Agent["model"] }) {
  const t = useTranslations("phase");
  return (
    <Tag title={t("modelTitle")} tone="accent">
      {model}
    </Tag>
  );
}

const thinkingTone = (level: AgentThinking = "low"): TagProps["tone"] =>
  ({
    high: "ok" as TagProps["tone"],
    medium: "warn" as TagProps["tone"],
    low: "neutral" as TagProps["tone"],
  })[level];

/** Thinking-level badge (high / medium / low). Tolerates an absent level (→ low). */
export function ThinkBadge({ level }: { level: Agent["thinking"] }) {
  const t = useTranslations("phase");
  return (
    <Tag title={t("thinkTitle")} tone={thinkingTone(level)}>
      ◇ {level}
    </Tag>
  );
}
