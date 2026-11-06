"use client";

import {
  type AutomationKey,
  type AutomationOverride,
  type AutomationToggles,
  type AutopilotAutomation,
  type Company,
  NO_AUTOMATION,
  type Team,
} from "@zibby/contracts";
import { Button, IndentRail, Row, Stack, ToggleField, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

export enum AutomationTreeTestId {
  Root = "automation-tree",
  Node = "automation-tree-node",
  Toggle = "automation-tree-toggle",
  Expand = "automation-tree-expand",
}

export interface AutomationTreeProps {
  value: AutopilotAutomation;
  onChange: (next: AutopilotAutomation) => void;
  companies: Company[];
  teams: Team[];
}

export const AUTOMATION_KEYS: readonly AutomationKey[] = [
  "autoReview",
  "autoAddressComments",
  "autoImplement",
  "autoCommunicate",
];

type Level = "companies" | "teams";

/** Merge `inherited` <- `override` (an absent key inherits). */
const apply = (inherited: AutomationToggles, override: AutomationOverride | undefined) => {
  const out = { ...inherited };
  for (const k of AUTOMATION_KEYS) out[k] = override?.[k] ?? out[k];
  return out;
};

const hasOverride = (override: AutomationOverride | undefined) =>
  !!override && Object.keys(override).length > 0;

interface NodeProps {
  node: string;
  label: string;
  override: AutomationOverride | undefined;
  inherited: AutomationToggles;
  onSet: (key: AutomationKey, next: boolean | undefined) => void;
  open: boolean;
  onToggleOpen: () => void;
  children?: ReactNode;
}

/** A company/team: collapsed to its name; open, its small toggles and its children. */
function OverrideNode({
  node,
  label,
  override,
  inherited,
  onSet,
  open,
  onToggleOpen,
  children,
}: NodeProps) {
  const t = useTranslations("autopilot");
  return (
    <Stack data-node={node} data-testid={AutomationTreeTestId.Node} gap="50">
      <Row gap="50">
        <Button
          aria-expanded={open}
          aria-label={`${open ? t("collapse") : t("expand")}: ${label}`}
          data-testid={AutomationTreeTestId.Expand}
          icon="chevron"
          intent="ghost"
          onClick={onToggleOpen}
          size="sm"
        />
        <Typography type="label">{label}</Typography>
      </Row>
      {open ? (
        <IndentRail>
          <Stack gap="50">
            {AUTOMATION_KEYS.map((key) => {
              const own = override?.[key];
              const effective = own ?? inherited[key];
              return (
                <Stack
                  data-effective={String(effective)}
                  data-key={key}
                  data-overridden={String(own !== undefined)}
                  data-testid={AutomationTreeTestId.Toggle}
                  key={key}
                >
                  <ToggleField
                    checked={effective}
                    label={t(key)}
                    labelCase="normal"
                    // Same as the parent = inherit (no override); different = an override.
                    onChange={(next) => onSet(key, next === inherited[key] ? undefined : next)}
                    size="sm"
                  />
                </Stack>
              );
            })}
            {children}
          </Stack>
        </IndentRail>
      ) : null}
    </Stack>
  );
}

/**
 * Company -> Team tree of the four autopilot toggles. Precedence team > company > nothing
 * (the root is all-off); a node only stores the toggles that differ from its parent.
 * `value.global` is ignored here. A node holding an override (or containing one) starts expanded.
 */
export function AutomationTree({ value, onChange, companies, teams }: AutomationTreeProps) {
  const t = useTranslations("autopilot");
  // The operator's own expand/collapse clicks; unset nodes follow "has an override inside".
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  const setOverride = (level: Level, id: string, key: AutomationKey, next: boolean | undefined) => {
    const { [id]: current, ...rest } = value[level];
    const merged: AutomationOverride = { ...current, [key]: next };
    if (next === undefined) delete merged[key];
    onChange({ ...value, [level]: hasOverride(merged) ? { ...rest, [id]: merged } : rest });
  };

  const nodeProps = (node: string, overridden: boolean) => ({
    node,
    open: opened[node] ?? overridden,
    onToggleOpen: () => setOpened((prev) => ({ ...prev, [node]: !(prev[node] ?? overridden) })),
  });

  const teamNode = (team: Team, inherited: AutomationToggles) => (
    <OverrideNode
      {...nodeProps(`team:${team.id}`, hasOverride(value.teams[team.id]))}
      inherited={inherited}
      key={team.id}
      label={team.name}
      onSet={(key, next) => setOverride("teams", team.id, key, next)}
      override={value.teams[team.id]}
    />
  );

  const companyIds = new Set(companies.map((c) => c.id));
  // The web nests teams by `team.companyId`; the backend resolves `project.companyId ?? team.companyId`.
  return (
    <Stack data-testid={AutomationTreeTestId.Root} gap="100">
      {companies.length > 0 || teams.length > 0 ? (
        <Typography size="xs" type="note" variant="tertiary">
          {t("overridesHint")}
        </Typography>
      ) : null}
      {companies.map((company) => {
        const inherited = apply(NO_AUTOMATION, value.companies[company.id]);
        const companyTeams = teams.filter((tm) => tm.companyId === company.id);
        const overridden =
          hasOverride(value.companies[company.id]) ||
          companyTeams.some((tm) => hasOverride(value.teams[tm.id]));
        return (
          <OverrideNode
            {...nodeProps(`company:${company.id}`, overridden)}
            inherited={NO_AUTOMATION}
            key={company.id}
            label={company.name}
            onSet={(key, next) => setOverride("companies", company.id, key, next)}
            override={value.companies[company.id]}
          >
            {companyTeams.map((tm) => teamNode(tm, inherited))}
          </OverrideNode>
        );
      })}
      {teams
        .filter((tm) => !tm.companyId || !companyIds.has(tm.companyId))
        .map((tm) => teamNode(tm, NO_AUTOMATION))}
    </Stack>
  );
}
