"use client";

import type { HandoffRule } from "@zibby/contracts";
import { Button, Stack, Tag, Toggle, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { isKnownSignalKind } from "../signalKinds";

export enum HandoffRuleRowTestId {
  Root = "handoff-rule-row-root",
  Toggle = "handoff-rule-row-toggle",
  Edit = "handoff-rule-row-edit",
  Delete = "handoff-rule-row-delete",
}

export interface HandoffRuleRowProps {
  rule: HandoffRule;
  /** This drawer's own subsystem name — the mad-libs sentence's subject. */
  subsystemName: string;
  /** Resolved display name of `rule.to` (subsystem or pipeline name, id fallback). */
  targetLabel: string;
  onToggle: () => void;
  onEdit: () => void;
  /** Absent for a `system` rule — deleting one 403s server-side, so the row must
   * never offer the affordance rather than let the operator hit a failed request. */
  onDelete?: () => void;
}

/** A highlighted inline value chip — mirrors the gates `Pat` chip used for match patterns. */
function Pat({ children }: { children: string }) {
  return (
    <Tag size="sm" tone="accent">
      {children}
    </Tag>
  );
}

/**
 * One outgoing handoff rule as a mad-libs Czech sentence (P2 design doc): „Když
 * **[subsystém]** vyprodukuje **[signalKind]** (≥ **[severity]**) → předat **[cíl]**
 * · tier **[N]**" — the `(≥ severity)` clause only renders when `minSeverity` is
 * set. Mirrors `GateRuleSentenceRow`'s structure (`HudPanel` has no `data-testid`
 * passthrough — the wrapping `div` carries it) and its row affordances: an
 * enable/disable toggle (always available — even a system rule can be retuned),
 * an edit button, and a delete button hidden for system rules.
 */
export function HandoffRuleRow({
  rule,
  subsystemName,
  targetLabel,
  onToggle,
  onEdit,
  onDelete,
}: HandoffRuleRowProps) {
  const t = useTranslations("subsystems.handoff");

  return (
    <div data-testid={HandoffRuleRowTestId.Root}>
      <HudPanel padding="150">
        <Stack wrap align="center" direction="row" gap="150">
          <Stack grow wrap align="center" direction="row" gap="75">
            <Typography size="sm" type="text" variant="secondary">
              {t("sentencePrefix", { subject: subsystemName })}
            </Typography>
            <Pat>
              {isKnownSignalKind(rule.signalKind)
                ? t(`signalKind.${rule.signalKind}`)
                : rule.signalKind}
            </Pat>
            {rule.minSeverity && (
              <>
                <Typography size="sm" type="text" variant="secondary">
                  {t("severityPrefix")}
                </Typography>
                <Pat>{t(`severity.${rule.minSeverity}`)}</Pat>
              </>
            )}
            <Typography size="sm" type="text" variant="secondary">
              {t("targetPrefix")}
            </Typography>
            <Pat>{targetLabel}</Pat>
            <Typography mono size="2xs" type="note" variant="tertiary">
              {t("tierLabel", { tier: rule.tier })}
            </Typography>
            {rule.system && (
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("systemBadge")}
              </Typography>
            )}
          </Stack>

          <Stack align="center" direction="row" gap="100">
            <Toggle
              checked={rule.enabled}
              data-testid={HandoffRuleRowTestId.Toggle}
              label={t("toggleLabel")}
              onChange={onToggle}
            />
            <Button
              aria-label={t("edit")}
              data-testid={HandoffRuleRowTestId.Edit}
              icon="edit"
              intent="ghost"
              onClick={onEdit}
              size="sm"
            />
            {onDelete && (
              <Button
                aria-label={t("delete")}
                data-testid={HandoffRuleRowTestId.Delete}
                icon="trash"
                intent="ghost"
                onClick={onDelete}
                size="sm"
              />
            )}
          </Stack>
        </Stack>
      </HudPanel>
    </div>
  );
}
