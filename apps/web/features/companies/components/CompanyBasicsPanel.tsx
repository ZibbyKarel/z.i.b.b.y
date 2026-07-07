"use client";

import { useTranslations } from "next-intl";
import { Button, Stack, Typography } from "@zibby/design-system";
import type { Company } from "@zibby/contracts";
import { FormTextInput, useFormControls } from "@zibby/forms";
import { HudPanel } from "../../../components/HudPanel/HudPanel";

/** The core company record fields this panel edits (name/desc/default budget). */
export interface CompanyBasicsBody {
  name: string;
  desc?: string;
  budget?: {
    dailyRuns?: number;
    weeklyRuns?: number;
    monthlyRuns?: number;
    maxConcurrent?: number;
    dailyCostCapUsd?: number;
    weeklyCostCapUsd?: number;
    monthlyCostCapUsd?: number;
  };
}

export interface CompanyBasicsPanelProps {
  /** The company being edited; undefined when creating a new one. */
  company?: Company;
  isNew: boolean;
  saving?: boolean;
  /** Persist the core fields (create when `isNew`, otherwise update). */
  onSave: (body: CompanyBasicsBody) => void;
  /** Remove the company (existing companies only); the parent confirms first. */
  onDelete?: () => void;
}

/** Parse a budget field: a positive integer, or undefined when blank/invalid. */
function toPositiveInt(raw: string): number | undefined {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Parse a dollar-cap field: a positive number, or undefined when blank/invalid. */
function toPositiveFloat(raw: string): number | undefined {
  const n = Number.parseFloat(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

type CompanyEditValues = {
  name: string;
  desc: string;
  budgetDailyRuns: string;
  budgetWeeklyRuns: string;
  budgetMonthlyRuns: string;
  budgetMaxConcurrent: string;
  budgetDailyCostCapUsd: string;
  budgetWeeklyCostCapUsd: string;
  budgetMonthlyCostCapUsd: string;
};

/**
 * The core-record editor for a company (name, description, default budget).
 * Lives on the company detail page — there is no company dialog; the same panel
 * creates a new company (`isNew`) and edits an existing one. Mount with
 * `key={company?.id ?? "new"}` so switching companies resets the captured form
 * defaults. Mirrors `ProjectBasicsPanel`, trimmed to the fields a company owns
 * (no category/logo/checks/env — those are project-only).
 */
export function CompanyBasicsPanel({
  company,
  isNew,
  saving,
  onSave,
  onDelete,
}: CompanyBasicsPanelProps) {
  const t = useTranslations("companies");

  const { renderForm, submit, form } = useFormControls<CompanyEditValues>({
    defaultValues: {
      name: company?.name ?? "",
      desc: company?.desc ?? "",
      budgetDailyRuns: company?.budget?.dailyRuns != null ? String(company.budget.dailyRuns) : "",
      budgetWeeklyRuns:
        company?.budget?.weeklyRuns != null ? String(company.budget.weeklyRuns) : "",
      budgetMonthlyRuns:
        company?.budget?.monthlyRuns != null ? String(company.budget.monthlyRuns) : "",
      budgetMaxConcurrent:
        company?.budget?.maxConcurrent != null ? String(company.budget.maxConcurrent) : "",
      budgetDailyCostCapUsd:
        company?.budget?.dailyCostCapUsd != null ? String(company.budget.dailyCostCapUsd) : "",
      budgetWeeklyCostCapUsd:
        company?.budget?.weeklyCostCapUsd != null ? String(company.budget.weeklyCostCapUsd) : "",
      budgetMonthlyCostCapUsd:
        company?.budget?.monthlyCostCapUsd != null ? String(company.budget.monthlyCostCapUsd) : "",
    },
    onSubmit: (values) => {
      const dailyRuns = toPositiveInt(values.budgetDailyRuns);
      const weeklyRuns = toPositiveInt(values.budgetWeeklyRuns);
      const monthlyRuns = toPositiveInt(values.budgetMonthlyRuns);
      const maxConcurrent = toPositiveInt(values.budgetMaxConcurrent);
      const dailyCostCapUsd = toPositiveFloat(values.budgetDailyCostCapUsd);
      const weeklyCostCapUsd = toPositiveFloat(values.budgetWeeklyCostCapUsd);
      const monthlyCostCapUsd = toPositiveFloat(values.budgetMonthlyCostCapUsd);
      const budget =
        dailyRuns != null ||
        weeklyRuns != null ||
        monthlyRuns != null ||
        maxConcurrent != null ||
        dailyCostCapUsd != null ||
        weeklyCostCapUsd != null ||
        monthlyCostCapUsd != null
          ? {
              ...(dailyRuns != null ? { dailyRuns } : {}),
              ...(weeklyRuns != null ? { weeklyRuns } : {}),
              ...(monthlyRuns != null ? { monthlyRuns } : {}),
              ...(maxConcurrent != null ? { maxConcurrent } : {}),
              ...(dailyCostCapUsd != null ? { dailyCostCapUsd } : {}),
              ...(weeklyCostCapUsd != null ? { weeklyCostCapUsd } : {}),
              ...(monthlyCostCapUsd != null ? { monthlyCostCapUsd } : {}),
            }
          : undefined;
      onSave({
        name: values.name.trim(),
        desc: values.desc.trim() || undefined,
        budget,
      });
    },
  });

  const [watchedName] = form.watch(["name"]);
  const canSave = (watchedName ?? "").trim().length > 0;

  return renderForm(
    <HudPanel
      action={
        <Button
          data-testid="save-basics"
          disabled={!canSave || saving}
          icon={isNew ? "plus" : "check"}
          intent="primary"
          onClick={() => void submit()}
          size="sm"
        >
          {isNew ? t("create") : t("save")}
        </Button>
      }
      title={t("profile.basics.title")}
    >
      <Stack gap="200">
        {isNew && (
          <Typography size="sm" type="note" variant="tertiary">
            {t("profile.basics.newHint")}
          </Typography>
        )}

        <FormTextInput<CompanyEditValues>
          autoFocus
          label={t("fields.name")}
          name="name"
          placeholder={t("fields.namePlaceholder")}
        />

        <FormTextInput<CompanyEditValues>
          label={t("fields.desc")}
          name="desc"
          placeholder={t("fields.descPlaceholder")}
        />

        <Stack gap="75">
          <Typography mono size="sm" type="note" variant="secondary">
            {t("fields.budget")}
          </Typography>
          <Typography size="xs" type="note" variant="tertiary">
            {t("fields.budgetHint")}
          </Typography>
          <Stack direction="row" gap="150">
            <FormTextInput<CompanyEditValues>
              inputMode="numeric"
              label={t("fields.budgetDailyRuns")}
              name="budgetDailyRuns"
              placeholder="—"
            />
            <FormTextInput<CompanyEditValues>
              inputMode="numeric"
              label={t("fields.budgetWeeklyRuns")}
              name="budgetWeeklyRuns"
              placeholder="—"
            />
            <FormTextInput<CompanyEditValues>
              inputMode="numeric"
              label={t("fields.budgetMonthlyRuns")}
              name="budgetMonthlyRuns"
              placeholder="—"
            />
            <FormTextInput<CompanyEditValues>
              inputMode="numeric"
              label={t("fields.budgetMaxConcurrent")}
              name="budgetMaxConcurrent"
              placeholder="—"
            />
          </Stack>
          <Stack direction="row" gap="150">
            <FormTextInput<CompanyEditValues>
              inputMode="decimal"
              label={t("fields.budgetDailyCostCapUsd")}
              name="budgetDailyCostCapUsd"
              placeholder="—"
            />
            <FormTextInput<CompanyEditValues>
              inputMode="decimal"
              label={t("fields.budgetWeeklyCostCapUsd")}
              name="budgetWeeklyCostCapUsd"
              placeholder="—"
            />
            <FormTextInput<CompanyEditValues>
              inputMode="decimal"
              label={t("fields.budgetMonthlyCostCapUsd")}
              name="budgetMonthlyCostCapUsd"
              placeholder="—"
            />
          </Stack>
        </Stack>

        {!isNew && onDelete && (
          <Stack align="start" direction="row">
            <Button
              data-testid="delete-company"
              icon="x"
              intent="danger"
              onClick={onDelete}
              size="sm"
            >
              {t("delete")}
            </Button>
          </Stack>
        )}
      </Stack>
    </HudPanel>,
  );
}
