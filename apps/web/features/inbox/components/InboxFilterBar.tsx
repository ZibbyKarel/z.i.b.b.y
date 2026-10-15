"use client";

import { Container, FilterBar, SelectField } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useCompaniesQuery } from "../../companies";
import { useProjectsQuery } from "../../projects";
import { useTeamsQuery } from "../../teams";
import { NONE_OPTION, hasInboxFilters } from "../inbox";
import { useInboxFilters } from "../useInboxFilters";

export enum InboxFilterBarTestId {
  Company = "inbox-filter-company",
  Team = "inbox-filter-team",
  Project = "inbox-filter-project",
}

/**
 * Company / team / project multi-selects shared by Overview, Issues and Pull
 * requests (spec decision 12): state lives in the URL and the last choice in
 * `localStorage` — see {@link useInboxFilters}. Offers "No company" / "No team".
 */
export function InboxFilterBar() {
  const t = useTranslations("inboxPage.filter");
  const { filters, setFilters, clearFilters } = useInboxFilters();
  const { data: companies } = useCompaniesQuery();
  const { data: teams } = useTeamsQuery();
  const { data: projects } = useProjectsQuery();

  const companyOptions = useMemo(
    () => [
      ...(companies ?? []).map((c) => ({ value: c.id, label: c.name })),
      { value: NONE_OPTION, label: t("noCompany") },
    ],
    [companies, t],
  );
  const teamOptions = useMemo(
    () => [
      ...(teams ?? []).map((x) => ({ value: x.id, label: x.name })),
      { value: NONE_OPTION, label: t("noTeam") },
    ],
    [teams, t],
  );
  const projectOptions = useMemo(
    () => (projects ?? []).map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  return (
    <FilterBar onClear={hasInboxFilters(filters) ? clearFilters : undefined}>
      <Container width="15rem">
        <SelectField
          compact
          multi
          label={t("company")}
          onValueChange={(company) => setFilters({ company })}
          options={companyOptions}
          placeholder={t("all")}
          removeLabel={t("remove")}
          value={filters.company}
        />
      </Container>
      <Container width="15rem">
        <SelectField
          compact
          multi
          label={t("team")}
          onValueChange={(team) => setFilters({ team })}
          options={teamOptions}
          placeholder={t("all")}
          removeLabel={t("remove")}
          value={filters.team}
        />
      </Container>
      <Container width="15rem">
        <SelectField
          compact
          multi
          label={t("project")}
          onValueChange={(project) => setFilters({ project })}
          options={projectOptions}
          placeholder={t("all")}
          removeLabel={t("remove")}
          value={filters.project}
        />
      </Container>
    </FilterBar>
  );
}
