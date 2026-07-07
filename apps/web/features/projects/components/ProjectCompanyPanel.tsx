"use client";

import { useTranslations } from "next-intl";
import { Divider, SelectField, Stack, Tag, Typography } from "@zibby/design-system";
import type { Integration, ProjectBudget } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useCompaniesQuery } from "../../companies";
import { useUpdateProjectMutation } from "../mutations";
import { useResolvedProjectQuery } from "../queries";

export enum ProjectCompanyPanelTestId {
  EffectiveNote = "project-company-effective-note",
  EffectivePeopleEmpty = "project-company-effective-people-empty",
  EffectiveBudgetEmpty = "project-company-effective-budget-empty",
  EffectiveIntegrationsEmpty = "project-company-effective-integrations-empty",
}

export interface ProjectCompanyPanelProps {
  projectId: string;
  /** The project's own raw `companyId` (undefined = no company linked). */
  companyId?: string;
}

/** The `SelectField` sentinel value for "no company" — an id can never be empty. */
const NO_COMPANY = "";

/** Full (root-namespace) i18n key for each fixed `Integration.kind` value. */
const KIND_LABEL_KEY = {
  slack: "integrations.kindSlack",
  email: "integrations.kindEmail",
  jira: "integrations.kindJira",
  github: "integrations.kindGithub",
  calendar: "integrations.kindCalendar",
} as const satisfies Record<Integration["kind"], string>;

/** Ordered (budget field, "projects" namespace label key) pairs shown in the effective panel. */
const BUDGET_FIELDS = [
  ["dailyRuns", "fields.budgetDailyRuns"],
  ["weeklyRuns", "fields.budgetWeeklyRuns"],
  ["monthlyRuns", "fields.budgetMonthlyRuns"],
  ["maxConcurrent", "fields.budgetMaxConcurrent"],
  ["dailyCostCapUsd", "fields.budgetDailyCostCapUsd"],
  ["weeklyCostCapUsd", "fields.budgetWeeklyCostCapUsd"],
  ["monthlyCostCapUsd", "fields.budgetMonthlyCostCapUsd"],
] as const satisfies readonly (readonly [keyof ProjectBudget, string])[];

/**
 * Project ↔ company wiring (Phase 72): a selector to link/unlink the project's
 * `companyId`, plus a read-only view of the project's EFFECTIVE (company-merged)
 * team/budget/integrations — legibly distinguished from the project's own raw
 * values shown elsewhere on this screen (team panel, basics panel, integrations
 * tab). Selecting "no company" sends `companyId: null`, the explicit unlink
 * signal `useUpdateProjectMutation`'s PATCH body needs (a JSON body can't
 * otherwise express "clear a field" — `undefined` keys never survive the wire).
 * When the project has no company, the effective facets are simply identical to
 * its own raw data — never implying a merge that didn't happen.
 */
export function ProjectCompanyPanel({ projectId, companyId }: ProjectCompanyPanelProps) {
  const t = useTranslations("projects.profile");
  const tp = useTranslations("projects");
  const tk = useTranslations();

  const { data: companies = [] } = useCompaniesQuery();
  const resolvedQ = useResolvedProjectQuery(projectId, { enabled: Boolean(projectId) });
  const updateProject = useUpdateProjectMutation();

  const options = [
    { value: NO_COMPANY, label: t("company.none") },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];

  function handleCompanyChange(value: string) {
    updateProject.mutate({
      params: { id: projectId },
      body: { companyId: value === NO_COMPANY ? null : value },
    });
  }

  const resolved = resolvedQ.data;
  const people = resolved?.people ?? [];
  const budget = BUDGET_FIELDS.flatMap(([key, labelKey]) => {
    const value = resolved?.budget?.[key];
    return value != null ? [{ key, label: tp(labelKey), value }] : [];
  });
  const integrations = resolved?.integrations ?? [];

  return (
    <HudPanel title={t("company.title")}>
      <Stack gap="200">
        <SelectField
          hint={t("company.hint")}
          label={t("company.select")}
          onValueChange={handleCompanyChange}
          options={options}
          value={companyId ?? NO_COMPANY}
        />

        <Divider />

        <Stack gap="150">
          <Typography mono size="sm" type="note" variant="secondary">
            {t("effective.title")}
          </Typography>
          <Typography
            data-testid={ProjectCompanyPanelTestId.EffectiveNote}
            size="xs"
            type="note"
            variant="tertiary"
          >
            {resolved?.companyId
              ? t("effective.fromCompany", { name: resolved.companyName ?? resolved.companyId })
              : t("effective.ownOnly")}
          </Typography>

          <Stack gap="75">
            <Typography size="xs" type="note" variant="tertiary">
              {t("effective.peopleTitle")}
            </Typography>
            {people.length === 0 ? (
              <Typography
                data-testid={ProjectCompanyPanelTestId.EffectivePeopleEmpty}
                size="sm"
                type="note"
                variant="tertiary"
              >
                {t("effective.noPeople")}
              </Typography>
            ) : (
              <Stack gap="50">
                {people.map((person) => (
                  <Stack align="center" direction="row" gap="100" key={person.id ?? person.name}>
                    <Typography size="sm" type="text">
                      {person.name}
                    </Typography>
                    <Typography size="xs" type="note" variant="tertiary">
                      {person.role}
                    </Typography>
                    {person.vip && <Tag tone="warn">VIP</Tag>}
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>

          <Stack gap="75">
            <Typography size="xs" type="note" variant="tertiary">
              {t("effective.budgetTitle")}
            </Typography>
            {budget.length === 0 ? (
              <Typography
                data-testid={ProjectCompanyPanelTestId.EffectiveBudgetEmpty}
                size="sm"
                type="note"
                variant="tertiary"
              >
                {t("effective.noBudget")}
              </Typography>
            ) : (
              <Stack wrap direction="row" gap="75">
                {budget.map((row) => (
                  <Tag key={row.key}>
                    {row.label}: {row.value}
                  </Tag>
                ))}
              </Stack>
            )}
          </Stack>

          <Stack gap="75">
            <Typography size="xs" type="note" variant="tertiary">
              {t("effective.integrationsTitle")}
            </Typography>
            {integrations.length === 0 ? (
              <Typography
                data-testid={ProjectCompanyPanelTestId.EffectiveIntegrationsEmpty}
                size="sm"
                type="note"
                variant="tertiary"
              >
                {t("effective.noIntegrations")}
              </Typography>
            ) : (
              <Stack gap="50">
                {integrations.map((integration) => (
                  <Stack align="center" direction="row" gap="100" key={integration.id}>
                    <Tag>{tk(KIND_LABEL_KEY[integration.kind])}</Tag>
                    <Typography size="sm" type="text">
                      {integration.name ?? integration.id}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>
        </Stack>
      </Stack>
    </HudPanel>
  );
}
