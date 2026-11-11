"use client";

import { type WidgetFilters, type WidgetSort, WidgetSortSchema } from "@zibby/contracts";
import { Container, Dropdown, FilterBar, SelectField, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { useCompaniesQuery } from "../../companies";
import type { TeamFilterOption } from "../state/rows";
import type { WidgetSettingsProps } from "./registry";

export enum WidgetSortSettingsTestId {
  Sort = "widget-settings-sort",
}

/** Settings section of a sortable widget (`prs`, `issues`): the list order, saved as `widget.sort`. */
export function WidgetSortSettings({ draft, onChange }: WidgetSettingsProps) {
  const t = useTranslations("bridge.settings");
  return (
    <Stack data-testid={WidgetSortSettingsTestId.Sort}>
      <SelectField
        label={t("sort")}
        onValueChange={(v) => {
          const sort = WidgetSortSchema.safeParse(v);
          if (sort.success) onChange({ ...draft, sort: sort.data });
        }}
        options={WidgetSortSchema.options.map((s) => ({ value: s, label: t(`sortBy.${s}`) }))}
        value={draft.sort ?? "updated-desc"}
      />
    </Stack>
  );
}

export enum WidgetSortControlTestId {
  Root = "widget-sort-control",
}

/** The list order in a widget's header filter bar — a live pick, like the filters. */
export function WidgetSortControl({
  value,
  onChange,
}: {
  value: WidgetSort;
  onChange: (next: WidgetSort) => void;
}) {
  const t = useTranslations("bridge.settings");
  return (
    <Container data-testid={WidgetSortControlTestId.Root}>
      <Dropdown
        aria-label={t("sort")}
        onChange={onChange}
        options={WidgetSortSchema.options.map((s) => ({ value: s, label: t(`sortBy.${s}`) }))}
        size="sm"
        value={value}
      />
    </Container>
  );
}

/**
 * A widget's live sort, starting from its saved `widget.sort` and reset when that changes (same
 * rule as `useWidgetFilterPick`). The third value is true while it differs from the saved one.
 */
export function useWidgetSortPick(
  saved: WidgetSort | undefined,
): [WidgetSort, (next: WidgetSort) => void, boolean] {
  const initial = saved ?? "updated-desc";
  const [sort, setSort] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setSort(initial);
  }
  return [sort, setSort, sort !== initial];
}

/** Drops unset groups (empty lists, `undefined`, `false`): an absent group doesn't filter. */
export function compactPick(pick: WidgetFilters): WidgetFilters {
  return Object.fromEntries(
    Object.entries(pick).filter(
      ([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && v.length === 0),
    ),
  ) as WidgetFilters;
}

/**
 * A widget's live filter pick, starting from its saved defaults (`widget.filters`). Saving new
 * defaults in the widget settings resets the pick to them. Keyed by content: the parent may
 * rebuild the object without the defaults having changed. The third value is true while the pick
 * differs from the defaults (the header shows the "filters applied" icon).
 */
export function useWidgetFilterPick(
  defaults: WidgetFilters | undefined,
): [WidgetFilters, (next: WidgetFilters) => void, boolean] {
  const [pick, setPick] = useState<WidgetFilters>(defaults ?? {});
  const defaultsKey = JSON.stringify(defaults ?? {});
  const [seenKey, setSeenKey] = useState(defaultsKey);
  if (seenKey !== defaultsKey) {
    setSeenKey(defaultsKey);
    setPick(defaults ?? {});
  }
  return [pick, setPick, !samePick(pick, defaults ?? {})];
}

/** Same filters regardless of key or list order; unset groups count as absent. */
export function samePick(a: WidgetFilters, b: WidgetFilters): boolean {
  // A legacy `mine: true` reads as `owner: "mine"`.
  const norm = ({ mine, ...p }: WidgetFilters) =>
    JSON.stringify(
      Object.entries(compactPick({ ...p, owner: p.owner ?? (mine ? "mine" : undefined) }))
        .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v])
        .sort(([x], [y]) => String(x).localeCompare(String(y))),
    );
  return norm(a) === norm(b);
}

/** The filter row a widget shows under its header while the header filters toggle is on. */
export function WidgetFilterBar({ open, children }: { open?: boolean; children: ReactNode }) {
  if (!open) return null;
  return (
    <Container padding={["100", "150"]}>
      <FilterBar>{children}</FilterBar>
    </Container>
  );
}

export interface OrgFilterControlsProps {
  pick: WidgetFilters;
  /** Receives the changed groups only; the caller merges and compacts. */
  onChange: (patch: Pick<WidgetFilters, "companies" | "teams">) => void;
  /** Team options; the team control is hidden when empty. */
  teams: TeamFilterOption[];
}

/**
 * Company + team multi-selects shared by every widget that filters by organisation. Once
 * companies are picked, only their teams (and teams already picked) stay on offer.
 */
export function OrgFilterControls({ pick, onChange, teams }: OrgFilterControlsProps) {
  const t = useTranslations("bridge.filterControls");
  const { data: companies = [] } = useCompaniesQuery();
  const pickedCompanies = pick.companies ?? [];
  const pickedTeams = pick.teams ?? [];
  const teamOptions =
    pickedCompanies.length === 0
      ? teams
      : teams.filter(
          (o) =>
            (o.companyId !== undefined && pickedCompanies.includes(o.companyId)) ||
            pickedTeams.includes(o.value),
        );
  return (
    <>
      {companies.length > 0 ? (
        <Dropdown
          compact
          multi
          showSelectAll
          aria-label={t("companies")}
          deselectAllLabel={t("deselectAll")}
          onChange={(v) => onChange({ companies: v })}
          options={companies.map((c) => ({ value: c.id, label: c.name }))}
          placeholder={t("companies")}
          selectAllLabel={t("selectAll")}
          size="sm"
          value={pickedCompanies}
        />
      ) : null}
      {teamOptions.length > 0 ? (
        <Dropdown
          compact
          multi
          showSelectAll
          aria-label={t("teams")}
          deselectAllLabel={t("deselectAll")}
          onChange={(v) => onChange({ teams: v })}
          options={teamOptions}
          placeholder={t("teams")}
          selectAllLabel={t("selectAll")}
          size="sm"
          value={pickedTeams}
        />
      ) : null}
    </>
  );
}
