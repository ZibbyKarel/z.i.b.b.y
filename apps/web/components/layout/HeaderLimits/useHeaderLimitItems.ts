import { MODEL_FAMILY_PROVIDER } from "@zibby/contracts";
import type { UsagePanelItem } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { AI_USAGE_DAYS, useAiUsageQuery } from "../../../features/ai-providers";
import { useLimitsQuery } from "../../../features/limits";
import { useSystemConfigQuery } from "../../../features/system";
import { useNow } from "../../../hooks/useNow";
import { formatCostUsd } from "../../../utils/cost";
import { MINUTE_MS, formatCountdown } from "../../../utils/time";

const DASH = "—";

/**
 * The top bar's limits for the selected model family: Claude (or the legacy native engine)
 * shows its 5H and weekly rings; every other family shows its own recorded cost and tokens
 * over the usage window, since opencode-run families expose no quota.
 */
export function useHeaderLimitItems(): UsagePanelItem[] {
  const t = useTranslations("shell");
  const locale = useLocale();
  const { data: limits } = useLimitsQuery();
  const { data: config } = useSystemConfigQuery();
  const { data: usage } = useAiUsageQuery();
  const now = useNow(MINUTE_MS);

  const family = config?.modelFamily;
  if (!config || config.aiEngine === "claude" || family === "claude" || !family) {
    const resetsIn = (resetsAt: number | null | undefined) =>
      resetsAt == null ? undefined : formatCountdown(resetsAt - now);
    return [
      {
        label: "5H",
        value: limits?.rolling.usedPct ?? 0,
        resetsIn: resetsIn(limits?.rolling.resetsAt),
      },
      {
        label: t("week"),
        value: limits?.weekly.usedPct ?? 0,
        resetsIn: resetsIn(limits?.weekly.resetsAt),
      },
    ];
  }

  const models = usage?.opencode.models.filter(
    (m) => m.providerId === MODEL_FAMILY_PROVIDER[family],
  );
  const costUsd = models?.reduce((sum, m) => sum + m.costUsd, 0) ?? 0;
  const tokens = models?.reduce((sum, m) => sum + m.tokens.input + m.tokens.output, 0) ?? 0;
  const cost = !usage
    ? DASH
    : costUsd > 0
      ? formatCostUsd(costUsd)
      : family === "opencode"
        ? t("usageFree")
        : DASH;
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  return [
    { label: t("usageCost", { days: usage?.days ?? AI_USAGE_DAYS }), stat: cost },
    { label: t("usageTokens"), stat: usage ? compact.format(tokens) : DASH },
  ];
}
