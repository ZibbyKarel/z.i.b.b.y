"use client";

import type { HandoffRule, HandoffSignalKind } from "@zibby/contracts";
import { Button, Stack, Tag, Toggle, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { signalKindLabel } from "../signalKinds";

export enum HandoffRuleRowTestId {
  Root = "handoff-rule-row-root",
  Toggle = "handoff-rule-row-toggle",
  Edit = "handoff-rule-row-edit",
  Delete = "handoff-rule-row-delete",
}

export interface HandoffRuleRowProps {
  rule: HandoffRule;
  /** The full signal-kind registry — used to resolve `rule.signalKind`'s display
   * label (built-in → localized `t()`, operator → stored `label`). */
  signalKinds: HandoffSignalKind[];
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
  signalKinds,
  subsystemName,
  targetLabel,
  onToggle,
  onEdit,
  onDelete,
}: HandoffRuleRowProps) {
  const t = useTranslations("subsystems.handoff");

  // Registry lookup by id — falls back to the raw stored kind when the rule's
  // signal kind isn't (or is no longer) in the registry (stale/unknown).
  const matchedKind = signalKinds.find((sk) => sk.id === rule.signalKind);
  const signalKindText = matchedKind ? signalKindLabel(matchedKind, t) : rule.signalKind;

  return (
    <div data-testid={HandoffRuleRowTestId.Root}>
      <HudPanel padding="150">
        <Stack wrap align="center" direction="row" gap="150">
          <Stack grow wrap align="center" direction="row" gap="75">
            <Typography size="sm" type="text" variant="secondary">
              {t("sentencePrefix", { subject: subsystemName })}
            </Typography>
            <Pat>{signalKindText}</Pat>
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
