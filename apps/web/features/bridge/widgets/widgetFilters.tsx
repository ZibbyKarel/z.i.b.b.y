"use client";

import type { WidgetFilters } from "@zibby/contracts";
import { Container, Dropdown, FilterBar } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { useCompaniesQuery } from "../../companies";
import type { TeamFilterOption } from "../state/rows";

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
 * rebuild the object without the defaults having changed.
 */
export function useWidgetFilterPick(
  defaults: WidgetFilters | undefined,
): [WidgetFilters, (next: WidgetFilters) => void] {
  const [pick, setPick] = useState<WidgetFilters>(defaults ?? {});
  const defaultsKey = JSON.stringify(defaults ?? {});
  const [seenKey, setSeenKey] = useState(defaultsKey);
  if (seenKey !== defaultsKey) {
    setSeenKey(defaultsKey);
    setPick(defaults ?? {});
  }
  return [pick, setPick];
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
          aria-label={t("companies")}
          onChange={(v) => onChange({ companies: v })}
          options={companies.map((c) => ({ value: c.id, label: c.name }))}
          placeholder={t("companies")}
          size="sm"
          value={pickedCompanies}
        />
      ) : null}
      {teamOptions.length > 0 ? (
        <Dropdown
          compact
          multi
          aria-label={t("teams")}
          onChange={(v) => onChange({ teams: v })}
          options={teamOptions}
          placeholder={t("teams")}
          size="sm"
          value={pickedTeams}
        />
      ) : null}
    </>
  );
}
