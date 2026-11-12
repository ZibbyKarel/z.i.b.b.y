"use client";

import { BoardLine, BoardRow, BoardTag, BoardText, Stack } from "@zibby/design-system";
import type { AiEngine } from "@zibby/contracts";
import { useLocale, useTranslations } from "next-intl";
import { PopoverRow } from "../../../components/layout/LimitsRings/PopoverRow";
import { useNow } from "../../../hooks/useNow";
import { useAiEnginesQuery, useAiUsageQuery } from "../../ai-providers";
import { useLimitsQuery } from "../../limits/queries";
import { useSystemConfigQuery } from "../../system";
import { formatCostUsd } from "../../../utils/cost";

export enum AiUsageSectionTestId {
  Claude = "ai-usage-claude",
  Opencode = "ai-usage-opencode",
  Global = "ai-usage-global",
  ActiveModel = "ai-usage-active-model",
  Unavailable = "ai-usage-unavailable",
  Empty = "ai-usage-empty",
  ModelRow = "ai-usage-model-row",
  Cost = "ai-usage-cost",
  Totals = "ai-usage-totals",
}

const NOW_TICK_MS = 30_000;

/**
 * "AI usage" block of the Budgets widget (the dashboard's limits home — the widget catalog is a
 * contract enum, so this lives inside the existing widget instead of a new type): Claude's 5h and
 * weekly limits, and opencode's active model plus recorded usage per provider/model. opencode
 * exposes no quota, so there are no percentages for it. Marks the globally selected engine.
 */
export function AiUsageSection() {
  const t = useTranslations("bridge.widgets.aiUsage");
  const now = useNow(NOW_TICK_MS);
  const limits = useLimitsQuery().data;
  const usage = useAiUsageQuery().data;
  const engines = useAiEnginesQuery().data?.engines;
  const config = useSystemConfigQuery().data;
  const active: AiEngine = config?.aiEngine ?? "claude";
  // The usage endpoint answers `available`; the engines list is the fallback while it loads.
  const opencodeAvailable =
    usage?.opencode.available ?? engines?.find((e) => e.id === "opencode")?.available;

  const globalTag = (id: AiEngine) =>
    active === id ? (
      <span data-testid={`${AiUsageSectionTestId.Global}-${id}`}>
        <BoardTag variant="you">{t("global")}</BoardTag>
      </span>
    ) : null;

  return (
    <>
      <BoardRow tone="neutral">
        <span data-testid={AiUsageSectionTestId.Claude}>
          <Stack gap="100">
            <BoardLine between gap="6" indent={false}>
              <BoardText kind="title">{t("claude")}</BoardText>
              {globalTag("claude")}
            </BoardLine>
            {limits ? (
              <>
                <PopoverRow label="limits.rollingLabel" now={now} window={limits.rolling} />
                <PopoverRow label="limits.weeklyLabel" now={now} window={limits.weekly} />
              </>
            ) : (
              <BoardText kind="meta" tone="ink3">
                {t("limitsUnknown")}
              </BoardText>
            )}
          </Stack>
        </span>
      </BoardRow>
      <BoardRow tone="neutral">
        <span data-testid={AiUsageSectionTestId.Opencode}>
          <Stack gap="100">
            <BoardLine between gap="6" indent={false}>
              <BoardText kind="title">{t("opencode")}</BoardText>
              {globalTag("opencode")}
            </BoardLine>
            <OpencodeBody available={opencodeAvailable} model={config?.opencodeModel ?? ""} />
          </Stack>
        </span>
      </BoardRow>
    </>
  );
}

interface OpencodeBodyProps {
  available: boolean | undefined;
  model: string;
}

function OpencodeBody({ available, model }: OpencodeBodyProps) {
  const t = useTranslations("bridge.widgets.aiUsage");
  const locale = useLocale();
  const usage = useAiUsageQuery().data;
  if (available === undefined) return null;
  if (!available) {
    return (
      <span data-testid={AiUsageSectionTestId.Unavailable}>
        <BoardText kind="meta" tone="ink3">
          {t("unavailable")}
        </BoardText>
      </span>
    );
  }
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const cost = (usd: number) => (usd === 0 ? t("free") : formatCostUsd(usd));
  const line = (u: NonNullable<typeof usage>["opencode"]["totals"]) =>
    t("line", {
      steps: u.steps,
      input: compact.format(u.tokens.input),
      output: compact.format(u.tokens.output),
    });
  const models = usage?.opencode.models ?? [];
  const totals = usage?.opencode.totals;

  return (
    <>
      <span data-testid={AiUsageSectionTestId.ActiveModel}>
        <BoardText kind="meta" tone="ink2">
          {model === "" ? t("noModel") : t("activeModel", { model })}
        </BoardText>
      </span>
      {models.length === 0 ? (
        <span data-testid={AiUsageSectionTestId.Empty}>
          <BoardText kind="meta" tone="ink3">
            {t("empty", { days: usage?.days ?? 30 })}
          </BoardText>
        </span>
      ) : (
        <>
          {models.map((m) => (
            <span
              data-testid={AiUsageSectionTestId.ModelRow}
              key={`${m.providerId}/${m.modelId}/${m.variant ?? ""}`}
            >
              <BoardLine between gap="6" indent={false}>
                <BoardText kind="meta" tone="ink2">
                  {`${m.providerId}/${m.modelId}${m.variant ? ` (${m.variant})` : ""}`}
                </BoardText>
                <BoardText kind="meta" tone="ink3">
                  {`${line(m)} · `}
                  <span data-testid={AiUsageSectionTestId.Cost}>{cost(m.costUsd)}</span>
                </BoardText>
              </BoardLine>
            </span>
          ))}
          {totals && (
            <span data-testid={AiUsageSectionTestId.Totals}>
              <BoardLine between gap="6" indent={false}>
                <BoardText kind="meta">{t("totals", { days: usage.days })}</BoardText>
                <BoardText kind="meta">{`${line(totals)} · ${cost(totals.costUsd)}`}</BoardText>
              </BoardLine>
            </span>
          )}
        </>
      )}
    </>
  );
}
