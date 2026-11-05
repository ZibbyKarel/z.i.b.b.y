"use client";

import type {
  AutomationKey,
  AutomationOverride,
  AutomationToggles,
  AutopilotAutomation,
  Company,
  Team,
} from "@zibby/contracts";
import {
  Button,
  Row,
  SegmentedControl,
  Stack,
  ToggleField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";

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

const KEYS: readonly AutomationKey[] = ["autoImplement", "autoReview", "autoAddressComments"];

type Level = "companies" | "teams";

/** Merge `inherited` <- `override` (an absent key inherits). */
const apply = (inherited: AutomationToggles, override: AutomationOverride | undefined) => {
  const out = { ...inherited };
  for (const k of KEYS) out[k] = override?.[k] ?? out[k];
  return out;
};

interface OverrideRowProps {
  node: string;
  label: string;
  override: AutomationOverride | undefined;
  inherited: AutomationToggles;
  onSet: (key: AutomationKey, next: boolean | undefined) => void;
  expand?: { open: boolean; onToggle: () => void } | undefined;
  indent?: boolean;
}

function OverrideRow({
  node,
  label,
  override,
  inherited,
  onSet,
  expand,
  indent,
}: OverrideRowProps) {
  const t = useTranslations("autopilot");
  return (
    <Stack data-node={node} data-testid={AutomationTreeTestId.Node} gap="75">
      <Row gap="100">
        {expand ? (
          <Button
            aria-expanded={expand.open}
            aria-label={`${expand.open ? t("collapse") : t("expand")}: ${label}`}
            data-testid={AutomationTreeTestId.Expand}
            icon="chevron"
            intent="ghost"
            onClick={expand.onToggle}
            size="sm"
          />
        ) : null}
        <Typography type="label">{indent ? `– ${label}` : label}</Typography>
      </Row>
      {KEYS.map((key) => {
        const own = override?.[key];
        const effective = inherited[key];
        return (
          <Stack
            data-effective={String(own ?? effective)}
            data-key={key}
            data-testid={AutomationTreeTestId.Toggle}
            gap="50"
            key={key}
          >
            <SegmentedControl
              ariaLabel={`${label}: ${t(key)}`}
              items={[
                { value: "inherit", label: t("stateInherit") },
                { value: "on", label: t("stateOn") },
                { value: "off", label: t("stateOff") },
              ]}
              onChange={(next) => onSet(key, next === "inherit" ? undefined : next === "on")}
              size="sm"
              value={own === undefined ? "inherit" : own ? "on" : "off"}
            />
            <Typography size="xs" type="note" variant="tertiary">
              {t(key)}
              {own === undefined
                ? ` — ${t("inherits", { state: effective ? t("stateOn") : t("stateOff") })}`
                : ""}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

/**
 * Global -> Company -> Team override tree for the three roadmap automation toggles.
 * Precedence team > company > global; "Inherit" removes the key (and an empty override).
 */
export function AutomationTree({ value, onChange, companies, teams }: AutomationTreeProps) {
  const t = useTranslations("autopilot");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const setOverride = (level: Level, id: string, key: AutomationKey, next: boolean | undefined) => {
    const { [id]: current, ...rest } = value[level];
    const merged: AutomationOverride = { ...current, [key]: next };
    if (next === undefined) delete merged[key];
    onChange({ ...value, [level]: Object.keys(merged).length ? { ...rest, [id]: merged } : rest });
  };

  const companyIds = new Set(companies.map((c) => c.id));
  const teamRow = (team: Team, inherited: AutomationToggles, indent: boolean) => (
    <OverrideRow
      indent={indent}
      inherited={inherited}
      key={team.id}
      label={team.name}
      node={`team:${team.id}`}
      onSet={(key, next) => setOverride("teams", team.id, key, next)}
      override={value.teams[team.id]}
    />
  );

  return (
    <Stack data-testid={AutomationTreeTestId.Root} gap="150">
      <Typography type="label">{t("automationTitle")}</Typography>
      <Typography size="xs" type="note" variant="tertiary">
        {t("automationHint")}
      </Typography>
      <Stack data-node="global" data-testid={AutomationTreeTestId.Node} gap="50">
        <Typography type="label">{t("global")}</Typography>
        {KEYS.map((key) => (
          <Stack data-key={key} data-testid={AutomationTreeTestId.Toggle} key={key}>
            <ToggleField
              checked={value.global[key]}
              label={t(key)}
              onChange={(next) => onChange({ ...value, global: { ...value.global, [key]: next } })}
            />
          </Stack>
        ))}
      </Stack>
      {companies.map((company) => {
        const inherited = apply(value.global, value.companies[company.id]);
        const isOpen = open.has(company.id);
        const companyTeams = teams.filter((tm) => tm.companyId === company.id);
        return (
          <Stack gap="100" key={company.id}>
            <OverrideRow
              expand={{
                open: isOpen,
                onToggle: () =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(company.id)) next.add(company.id);
                    return next;
                  }),
              }}
              inherited={value.global}
              label={company.name}
              node={`company:${company.id}`}
              onSet={(key, next) => setOverride("companies", company.id, key, next)}
              override={value.companies[company.id]}
            />
            {isOpen && companyTeams.map((tm) => teamRow(tm, inherited, true))}
          </Stack>
        );
      })}
      {teams
        .filter((tm) => !tm.companyId || !companyIds.has(tm.companyId))
        .map((tm) => teamRow(tm, value.global, false))}
    </Stack>
  );
}
