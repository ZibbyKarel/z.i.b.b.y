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
import {
  Button,
  DataTable,
  type DataTableColumn,
  Row,
  Stack,
  Toggle,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";

export enum AutomationTreeTestId {
  Root = "automation-tree",
  Title = "automation-tree-title",
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
  "autoFixCi",
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

const sameToggles = (a: AutomationToggles, b: AutomationToggles) =>
  AUTOMATION_KEYS.every((k) => a[k] === b[k]);

interface TreeRow {
  /** `company:<id>` / `team:<id>` — also the DataTable row key. */
  node: string;
  label: string;
  level: Level;
  id: string;
  depth: number;
  override: AutomationOverride | undefined;
  inherited: AutomationToggles;
  /** The parent row's node, for pinning its open state on edit. */
  parent?: string;
  hasChildren: boolean;
  open: boolean;
}

/**
 * The "Autonomy level" table: companies with their teams nested, one Toggle column per autopilot
 * key. Precedence team > company > nothing (the root is all-off); a row only stores the toggles
 * that differ from its parent. `value.global` is ignored here. A company starts collapsed when all
 * its teams' effective values equal its own; once the operator touches it, its open state sticks.
 */
export function AutomationTree({ value, onChange, companies, teams }: AutomationTreeProps) {
  const t = useTranslations("autopilot");
  // The operator's own expand/collapse (or edit); unset rows follow "a team differs from it".
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  const setOverride = (row: TreeRow, key: AutomationKey, next: boolean | undefined) => {
    const pin = row.parent ?? (row.hasChildren ? row.node : undefined);
    // Freeze the company's current open state so the edit doesn't collapse/expand it under the cursor.
    if (pin && opened[pin] === undefined)
      setOpened((prev) => ({ ...prev, [pin]: row.parent ? true : row.open }));
    const { [row.id]: current, ...rest } = value[row.level];
    const merged: AutomationOverride = { ...current, [key]: next };
    if (next === undefined) delete merged[key];
    onChange({ ...value, [row.level]: hasOverride(merged) ? { ...rest, [row.id]: merged } : rest });
  };

  const teamRow = (team: Team, inherited: AutomationToggles, parent?: string): TreeRow => ({
    node: `team:${team.id}`,
    label: team.name,
    level: "teams",
    id: team.id,
    depth: parent ? 1 : 0,
    override: value.teams[team.id],
    inherited,
    parent,
    hasChildren: false,
    open: false,
  });

  const companyIds = new Set(companies.map((c) => c.id));
  // The web nests teams by `team.companyId`; the backend resolves `project.companyId ?? team.companyId`.
  const rows: TreeRow[] = companies.flatMap((company) => {
    const node = `company:${company.id}`;
    const own = apply(NO_AUTOMATION, value.companies[company.id]);
    const children = teams
      .filter((tm) => tm.companyId === company.id)
      .map((tm) => teamRow(tm, own, node));
    const differs = children.some((r) => !sameToggles(apply(own, r.override), own));
    const open = children.length > 0 && (opened[node] ?? differs);
    const parent: TreeRow = {
      node,
      label: company.name,
      level: "companies",
      id: company.id,
      depth: 0,
      override: value.companies[company.id],
      inherited: NO_AUTOMATION,
      hasChildren: children.length > 0,
      open,
    };
    return open ? [parent, ...children] : [parent];
  });
  rows.push(
    ...teams
      .filter((tm) => !tm.companyId || !companyIds.has(tm.companyId))
      .map((tm) => teamRow(tm, NO_AUTOMATION)),
  );

  const columns: DataTableColumn<TreeRow>[] = [
    {
      key: "name",
      label: t("tableName"),
      width: "flex",
      render: (row) => (
        <Row gap="50">
          {row.hasChildren ? (
            <Button
              aria-expanded={row.open}
              aria-label={`${row.open ? t("collapse") : t("expand")}: ${row.label}`}
              data-testid={AutomationTreeTestId.Expand}
              icon="chevron"
              intent="ghost"
              onClick={() => setOpened((prev) => ({ ...prev, [row.node]: !row.open }))}
              size="sm"
            />
          ) : null}
          <Typography type="label">{row.label}</Typography>
        </Row>
      ),
    },
    ...AUTOMATION_KEYS.map(
      (key): DataTableColumn<TreeRow> => ({
        key,
        label: t(key),
        width: "md",
        align: "center",
        render: (row) => {
          const own = row.override?.[key];
          const effective = own ?? row.inherited[key];
          return (
            <Row
              data-effective={String(effective)}
              data-key={key}
              data-overridden={String(own !== undefined)}
              data-testid={AutomationTreeTestId.Toggle}
              justify="center"
            >
              <Toggle
                checked={effective}
                label={`${t(key)}: ${row.label}`}
                // Same as the parent = inherit (no override); different = an override.
                onChange={(next) =>
                  setOverride(row, key, next === row.inherited[key] ? undefined : next)
                }
                size="sm"
              />
            </Row>
          );
        },
      }),
    ),
  ];

  return (
    <Stack data-testid={AutomationTreeTestId.Root} gap="50">
      <Typography data-testid={AutomationTreeTestId.Title} type="label">
        {t("tableTitle")}
      </Typography>
      {rows.length > 0 ? (
        <Typography size="xs" type="note" variant="tertiary">
          {t("overridesHint")}
        </Typography>
      ) : null}
      <DataTable
        columns={columns}
        getRowDepth={(row) => row.depth}
        getRowKey={(row) => row.node}
        rows={rows}
      />
    </Stack>
  );
}
