"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { GateRule, GateRuleInput, GlobalGateRule } from "@zibby/contracts";
import {
  Button,
  Card,
  Container,
  Icon,
  SelectField,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useGateRulesQuery, useSystemPolicyQuery } from "../../gates";
import { RuleCard } from "../../gates/components/RuleCard";
import { DecisionBadge, MatcherText, ResolveChips } from "../../gates/components/RuleParts";
import { MATCHER_ICON } from "../../gates/gate";

export interface AgentRulesSectionProps {
  /** Display name of the agent whose rules are being edited. */
  agentName: string;
  /** The agent's own rules (frontmatter `gates`); editable here. */
  gates: GateRuleInput[];
  /** Ids of linked global catalog rules (frontmatter `gateRuleIds`). */
  gateRuleIds: string[];
  onAddRule: () => void;
  onEditRule: (index: number) => void;
  onDeleteRule: (index: number) => void;
  onLinkedChange: (ids: string[]) => void;
}

/** A group header with a count, used to separate the three rule layers. */
function GroupHeading({
  icon,
  tone,
  title,
  count,
}: {
  icon: "shield" | "link" | "bolt";
  tone: "warn" | "accent";
  title: string;
  count?: number;
}) {
  return (
    <Stack align="center" direction="row" gap="100">
      <Icon name={icon} size="xs" tone={tone} />
      <Typography mono uppercase size="2xs" tone={tone} tracking="widest" type="note" weight="bold">
        {title}
      </Typography>
      {count !== undefined && (
        <Typography mono size="2xs" type="note" variant="tertiary">
          {count}
        </Typography>
      )}
    </Stack>
  );
}

/** A read-only row for a linked global rule (edited on the catalog page), with unlink. */
function LinkedRuleRow({
  rule,
  andLabel,
  youLabel,
  decisionLabel,
  unlinkLabel,
  onUnlink,
}: {
  rule: GlobalGateRule;
  andLabel: string;
  youLabel: string;
  decisionLabel: string;
  unlinkLabel: string;
  onUnlink: () => void;
}) {
  const matcherIcon = MATCHER_ICON[rule.match[0]?.type ?? "action"];
  return (
    <Card background="background" radius="sm">
      <Container padding="150">
        <Stack align="center" direction="row" gap="100">
          <Icon name={matcherIcon} size="sm" tone="faint" />
          <Container grow minW0>
            <Stack gap="50">
              {rule.name && (
                <Typography mono size="sm" type="note" variant="secondary">
                  {rule.name}
                </Typography>
              )}
              <Stack wrap align="center" direction="row" gap="100">
                <MatcherText andLabel={andLabel} match={rule.match} />
                <DecisionBadge decision={rule.decision} label={decisionLabel} />
                {rule.decision === "ask" && (
                  <ResolveChips resolve={rule.resolve} youLabel={youLabel} />
                )}
              </Stack>
            </Stack>
          </Container>
          <Button aria-label={unlinkLabel} icon="x" intent="ghost" onClick={onUnlink} size="sm" />
        </Stack>
      </Container>
    </Card>
  );
}

/**
 * The "Rules" tab of the agent editor — three layers, evaluated top-down (first
 * match wins): the locked system floor (inherited, read-only), the linked global
 * catalog rules (shared, edited on the catalog page; link/unlink here), and the
 * agent's own rules (editable). Own rules and links persist on the agent entity
 * via the editor's single Save; the floor is enforced server-side regardless.
 */
export function AgentRulesSection({
  agentName,
  gates,
  gateRuleIds,
  onAddRule,
  onEditRule,
  onDeleteRule,
  onLinkedChange,
}: AgentRulesSectionProps) {
  const t = useTranslations("gates");
  const { data: inherited = [] } = useSystemPolicyQuery();
  const { data: globalRules = [] } = useGateRulesQuery();

  const decisionLabel = (d: GateRule["decision"]) => t(`decision_.${d}`);
  const ruleProps = {
    andLabel: t("and"),
    youLabel: t("you"),
    notifyHint: t("notifyHint"),
  };

  const linked = useMemo(
    () =>
      gateRuleIds
        .map((id) => globalRules.find((r) => r.id === id))
        .filter((r): r is GlobalGateRule => Boolean(r)),
    [gateRuleIds, globalRules],
  );
  const available = useMemo(
    () => globalRules.filter((r) => !gateRuleIds.includes(r.id)),
    [globalRules, gateRuleIds],
  );

  /** Own rules are id-less in `gates`; key them by index for display + callbacks. */
  const ownDisplay: GateRule[] = gates.map((g, i) => ({
    id: String(i),
    source: "agent",
    locked: false,
    ...g,
  }));

  return (
    <Stack gap="250">
      <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
        {t("evalNote")}
      </Typography>

      {/* 1) Inherited system floor — read-only */}
      <Stack gap="100">
        <GroupHeading icon="shield" title={t("inheritedTitle")} tone="warn" />
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("inheritedNote")}
        </Typography>
        {inherited.length === 0 ? (
          <Typography mono size="xs" type="note" variant="tertiary">
            {t("noInherited")}
          </Typography>
        ) : (
          <Stack gap="100">
            {inherited.map((rule) => (
              <RuleCard
                locked
                key={rule.id}
                rule={rule}
                {...ruleProps}
                decisionLabel={decisionLabel(rule.decision)}
              />
            ))}
          </Stack>
        )}
      </Stack>

      {/* 2) Linked global catalog rules — shared, edited on the catalog page */}
      <Stack gap="100">
        <GroupHeading count={linked.length} icon="link" title={t("linkedTitle")} tone="accent" />
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("linkedNote")}
        </Typography>
        {linked.length === 0 ? (
          <Typography mono size="xs" type="note" variant="tertiary">
            {t("noLinked")}
          </Typography>
        ) : (
          <Stack gap="100">
            {linked.map((rule) => (
              <LinkedRuleRow
                andLabel={ruleProps.andLabel}
                decisionLabel={decisionLabel(rule.decision)}
                key={rule.id}
                onUnlink={() => onLinkedChange(gateRuleIds.filter((id) => id !== rule.id))}
                rule={rule}
                unlinkLabel={t("unlink")}
                youLabel={ruleProps.youLabel}
              />
            ))}
          </Stack>
        )}
        {available.length > 0 && (
          <SelectField
            label={t("linkGlobal")}
            onValueChange={(id) => {
              if (id) onLinkedChange([...gateRuleIds, id]);
            }}
            options={[
              { value: "", label: t("linkGlobalPlaceholder") },
              ...available.map((r) => ({ value: r.id, label: r.name ?? r.id })),
            ]}
            value=""
          />
        )}
      </Stack>

      {/* 3) The agent's own rules — editable */}
      <Stack gap="100">
        <GroupHeading
          count={gates.length}
          icon="bolt"
          title={t("ownTitle", { agent: agentName })}
          tone="accent"
        />
        {ownDisplay.length === 0 ? (
          <Typography mono size="xs" type="note" variant="tertiary">
            {t("noOwnRules")}
          </Typography>
        ) : (
          <Stack gap="100">
            {ownDisplay.map((rule, i) => (
              <RuleCard
                deleteLabel={t("delete")}
                editLabel={t("edit")}
                key={i}
                onDelete={() => onDeleteRule(i)}
                onEdit={() => onEditRule(i)}
                rule={rule}
                {...ruleProps}
                decisionLabel={decisionLabel(rule.decision)}
              />
            ))}
          </Stack>
        )}
        <Button block icon="plus" intent="ghost" onClick={onAddRule} size="sm">
          {t("addRule")}
        </Button>
      </Stack>
    </Stack>
  );
}
