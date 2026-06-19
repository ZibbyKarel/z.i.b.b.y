"use client";

import { type ReactNode } from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Pressable, Stack, Tag, TextAreaField, Typography } from "@zibby/design-system";
import type { Category, Project } from "@zibby/contracts";
import { Controller, FormTextInput, useFormControls } from "@zibby/forms";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { KeyValueEditor, type KeyValueRow } from "./KeyValueEditor";

/** The core project record fields this panel edits (name/path/category/desc/budget/checks/env). */
export interface ProjectBasicsBody {
  name: string;
  path: string;
  desc?: string;
  category?: string;
  budget?: {
    dailyRuns?: number;
    weeklyRuns?: number;
    monthlyRuns?: number;
    maxConcurrent?: number;
  };
  checks?: string[];
  env?: Record<string, string>;
}

export interface ProjectBasicsPanelProps {
  /** The project being edited; undefined when creating a new one. */
  project?: Project;
  isNew: boolean;
  categories: Category[];
  saving?: boolean;
  /** Persist the core fields (create when `isNew`, otherwise update). */
  onSave: (body: ProjectBasicsBody) => void;
  /** Remove the project (existing projects only); the parent confirms first. */
  onDelete?: () => void;
}

/** Build an ordered env row list from the entity's record (kept stable for inputs). */
function toRows(record: Record<string, string> | undefined): KeyValueRow[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }));
}

/** Collapse env rows back to a record, dropping blank keys (last wins on collision). */
function fromRows(rows: KeyValueRow[]): Record<string, string> | undefined {
  const entries = rows
    .map((r): [string, string] => [r.key.trim(), r.value])
    .filter(([key]) => key.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

type ProjectEditValues = {
  name: string;
  path: string;
  desc: string;
  category: string;
  budgetDailyRuns: string;
  budgetWeeklyRuns: string;
  budgetMonthlyRuns: string;
  budgetMaxConcurrent: string;
};

/** Parse a budget field: a positive integer, or undefined when blank/invalid. */
function toPositiveInt(raw: string): number | undefined {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable onClick={onClick}>
      <Tag tone={active ? "accent" : "neutral"}>{children}</Tag>
    </Pressable>
  );
}

/**
 * The core-record editor for a project (name, host path, category, description,
 * budget, verify checks and env vars). Lives on the project detail page — there is
 * no project dialog; the same panel creates a new project (`isNew`) and edits an
 * existing one. Mount with `key={project?.id ?? "new"}` so switching projects
 * resets the captured form defaults.
 */
export function ProjectBasicsPanel({
  project,
  isNew,
  categories,
  saving,
  onSave,
  onDelete,
}: ProjectBasicsPanelProps) {
  const t = useTranslations("projects");
  const [envRows, setEnvRows] = useState<KeyValueRow[]>(toRows(project?.env));
  // Verify-phase shell commands, one per line (joined with && by the runner).
  const [checksText, setChecksText] = useState((project?.checks ?? []).join("\n"));

  const { renderForm, submit, form } = useFormControls<ProjectEditValues>({
    defaultValues: {
      name: project?.name ?? "",
      path: project?.path ?? "~/Projects/",
      desc: project?.desc ?? "",
      category: project?.category ?? categories[0]?.name ?? "",
      budgetDailyRuns: project?.budget?.dailyRuns != null ? String(project.budget.dailyRuns) : "",
      budgetWeeklyRuns:
        project?.budget?.weeklyRuns != null ? String(project.budget.weeklyRuns) : "",
      budgetMonthlyRuns:
        project?.budget?.monthlyRuns != null ? String(project.budget.monthlyRuns) : "",
      budgetMaxConcurrent:
        project?.budget?.maxConcurrent != null ? String(project.budget.maxConcurrent) : "",
    },
    onSubmit: (values) => {
      const dailyRuns = toPositiveInt(values.budgetDailyRuns);
      const weeklyRuns = toPositiveInt(values.budgetWeeklyRuns);
      const monthlyRuns = toPositiveInt(values.budgetMonthlyRuns);
      const maxConcurrent = toPositiveInt(values.budgetMaxConcurrent);
      const budget =
        dailyRuns != null || weeklyRuns != null || monthlyRuns != null || maxConcurrent != null
          ? {
              ...(dailyRuns != null ? { dailyRuns } : {}),
              ...(weeklyRuns != null ? { weeklyRuns } : {}),
              ...(monthlyRuns != null ? { monthlyRuns } : {}),
              ...(maxConcurrent != null ? { maxConcurrent } : {}),
            }
          : undefined;
      const checks = checksText
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean);
      onSave({
        name: values.name.trim(),
        path: values.path.trim(),
        desc: values.desc.trim() || undefined,
        category: values.category || undefined,
        budget,
        checks: checks.length > 0 ? checks : undefined,
        env: fromRows(envRows),
      });
    },
  });

  const [watchedName, watchedPath] = form.watch(["name", "path"]);
  const canSave = (watchedName ?? "").trim().length > 0 && (watchedPath ?? "").trim().length > 0;

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

        <FormTextInput<ProjectEditValues>
          autoFocus
          label={t("fields.name")}
          name="name"
          placeholder={t("fields.namePlaceholder")}
        />

        <FormTextInput<ProjectEditValues>
          hint={t("fields.pathHint")}
          label={t("fields.path")}
          name="path"
          placeholder={t("fields.pathPlaceholder")}
        />

        {categories.length > 0 && (
          <Controller<ProjectEditValues, "category">
            control={form.control}
            name="category"
            render={({ field }) => (
              <Stack gap="75">
                <Typography mono size="sm" type="note" variant="secondary">
                  {t("fields.category")}
                </Typography>
                <Stack wrap direction="row" gap="75">
                  {categories.map((c) => (
                    <ChipToggle
                      active={field.value === c.name}
                      key={c.name}
                      onClick={() => field.onChange(c.name)}
                    >
                      {c.name}
                    </ChipToggle>
                  ))}
                </Stack>
              </Stack>
            )}
          />
        )}

        <FormTextInput<ProjectEditValues>
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
            <FormTextInput<ProjectEditValues>
              inputMode="numeric"
              label={t("fields.budgetDailyRuns")}
              name="budgetDailyRuns"
              placeholder="—"
            />
            <FormTextInput<ProjectEditValues>
              inputMode="numeric"
              label={t("fields.budgetWeeklyRuns")}
              name="budgetWeeklyRuns"
              placeholder="—"
            />
            <FormTextInput<ProjectEditValues>
              inputMode="numeric"
              label={t("fields.budgetMonthlyRuns")}
              name="budgetMonthlyRuns"
              placeholder="—"
            />
            <FormTextInput<ProjectEditValues>
              inputMode="numeric"
              label={t("fields.budgetMaxConcurrent")}
              name="budgetMaxConcurrent"
              placeholder="—"
            />
          </Stack>
        </Stack>

        <Stack gap="75">
          <Typography mono size="sm" type="note" variant="secondary">
            {t("fields.checks")}
          </Typography>
          <Typography size="xs" type="note" variant="tertiary">
            {t("fields.checksHint")}
          </Typography>
          <TextAreaField
            data-testid="project-checks"
            label={t("fields.checks")}
            onChange={(e) => setChecksText(e.target.value)}
            placeholder={"pnpm lint\npnpm test"}
            rows={3}
            value={checksText}
          />
        </Stack>

        <Stack gap="75">
          <Typography mono size="sm" type="note" variant="secondary">
            {t("fields.env")}
          </Typography>
          <Typography size="xs" type="note" variant="tertiary">
            {t("fields.envHint")}
          </Typography>
          <KeyValueEditor
            addLabel={t("fields.envAdd")}
            keyLabel={t("fields.envKey")}
            keyPlaceholder="NODE_ENV"
            onChange={setEnvRows}
            removeLabel={t("fields.envRemove")}
            rows={envRows}
            testIdPrefix="project-env"
            valueLabel={t("fields.envValue")}
            valuePlaceholder="production"
          />
        </Stack>

        {!isNew && onDelete && (
          <Stack align="start" direction="row">
            <Button icon="x" intent="danger" onClick={onDelete} size="sm">
              {t("delete")}
            </Button>
          </Stack>
        )}
      </Stack>
    </HudPanel>,
  );
}
