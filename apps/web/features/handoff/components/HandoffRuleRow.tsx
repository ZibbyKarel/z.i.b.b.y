"use client";

import type { HandoffRule, HandoffSignalKind } from "@zibby/contracts";
import { Button, Stack, Tag, type TagTone, Toggle, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { signalKindLabel } from "../signalKinds";
import { TIER_TONE } from "../tierTone";

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

/** A highlighted inline value chip — mirrors the gates `Pat` chip used for match
 * patterns, toned per field so signal/target/tier read apart at a glance. */
function Pat({ children, tone = "accent" }: { children: string; tone?: TagTone }) {
  return (
    <Tag size="sm" tone={tone}>
      {children}
    </Tag>
  );
}

/**
 * One outgoing handoff rule as a mad-libs Czech sentence (P2 design doc, aligned
 * to `design/Z.I.B.B.Y/ZIBBY Handoff.html`'s rule row): „Když **[subsystém]**
 * vyprodukuje **[signalKind]** (≥ **[severity]**) → předat **[cíl]** jako
 * **[tier]**" — the `(≥ severity)` clause only renders when `minSeverity` is set.
 * The three chips are toned per field (signal = run, target = accent, tier =
 * ok/run/warn by autonomy tier) so the sentence reads apart at a glance, same as
 * the mockup's colored inline selects. Mirrors `GateRuleSentenceRow`'s structure
 * (`HudPanel` has no `data-testid` passthrough — the wrapping `div` carries it)
 * and its row affordances: an enable/disable toggle (always available — even a
 * system rule can be retuned), an edit button, and a delete button hidden for
 * system rules.
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
      <HudPanel background="background" padding="150" radius="sm">
        <Stack wrap align="center" direction="row" gap="125">
          <Stack grow wrap align="center" direction="row" gap="100">
            <Typography size="sm" type="text" variant="secondary">
              {t("sentencePrefix", { subject: subsystemName })}
            </Typography>
            <Pat tone="run">{signalKindText}</Pat>
            {rule.minSeverity && (
              <>
                <Typography size="sm" type="text" variant="secondary">
                  {t("severityPrefix")}
                </Typography>
                <Pat tone="neutral">{t(`severity.${rule.minSeverity}`)}</Pat>
              </>
            )}
            <Typography size="sm" type="text" variant="secondary">
              {t("targetPrefix")}
            </Typography>
            <Pat tone="accent">{targetLabel}</Pat>
            <Typography size="sm" type="text" variant="secondary">
              {t("tierPrefix")}
            </Typography>
            <Pat tone={TIER_TONE[rule.tier]}>{t(`tierName.${rule.tier}`)}</Pat>
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
