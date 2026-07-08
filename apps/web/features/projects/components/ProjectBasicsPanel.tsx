"use client";

import { type ChangeEvent, type ReactNode } from "react";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  IconTile,
  Pressable,
  Stack,
  Tag,
  TextAreaField,
  Typography,
} from "@zibby/design-system";
import type { Category, Project } from "@zibby/contracts";
import { Controller, FormTextInput, useFormControls } from "@zibby/forms";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { toastBus } from "../../../components/Toaster/toastBus";
import { KeyValueEditor, type KeyValueRow } from "./KeyValueEditor";

/**
 * Mirrors `ProjectSchema.logo`'s cap (280 000 base64 chars, ~200 KB) so an
 * oversized file is rejected client-side with a toast instead of a 422 on save.
 */
const LOGO_MAX_DATA_URI_LENGTH = 280_000;

/** The core project record fields this panel edits (name/path/category/desc/logo/budget/checks/env). */
export interface ProjectBasicsBody {
  name: string;
  path: string;
  desc?: string;
  category?: string;
  /** Git remote URL — where ZIBBY clones this project from on another machine (Phase 76/77). */
  gitRemote?: string;
  /** Custom logo as a data URI; absent/undefined falls back to the default glyph. */
  logo?: string;
  budget?: {
    dailyRuns?: number;
    weeklyRuns?: number;
    monthlyRuns?: number;
    maxConcurrent?: number;
    /** Phase 12: dollar caps, same windows as the run-count caps above. */
    dailyCostCapUsd?: number;
    weeklyCostCapUsd?: number;
    monthlyCostCapUsd?: number;
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
  gitRemote: string;
  budgetDailyRuns: string;
  budgetWeeklyRuns: string;
  budgetMonthlyRuns: string;
  budgetMaxConcurrent: string;
  budgetDailyCostCapUsd: string;
  budgetWeeklyCostCapUsd: string;
  budgetMonthlyCostCapUsd: string;
};

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
  const [logo, setLogo] = useState<string | undefined>(project?.logo);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function handleLogoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toastBus.emit({ message: t("fields.logoTooLarge") });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = typeof reader.result === "string" ? reader.result : null;
      if (dataUri != null && dataUri.length <= LOGO_MAX_DATA_URI_LENGTH) {
        setLogo(dataUri);
      } else {
        toastBus.emit({ message: t("fields.logoTooLarge") });
      }
    };
    reader.readAsDataURL(file);
  }

  const { renderForm, submit, form } = useFormControls<ProjectEditValues>({
    defaultValues: {
      name: project?.name ?? "",
      path: project?.path ?? "~/Projects/",
      desc: project?.desc ?? "",
      category: project?.category ?? categories[0]?.name ?? "",
      gitRemote: project?.gitRemote ?? "",
      budgetDailyRuns: project?.budget?.dailyRuns != null ? String(project.budget.dailyRuns) : "",
      budgetWeeklyRuns:
        project?.budget?.weeklyRuns != null ? String(project.budget.weeklyRuns) : "",
      budgetMonthlyRuns:
        project?.budget?.monthlyRuns != null ? String(project.budget.monthlyRuns) : "",
      budgetMaxConcurrent:
        project?.budget?.maxConcurrent != null ? String(project.budget.maxConcurrent) : "",
      budgetDailyCostCapUsd:
        project?.budget?.dailyCostCapUsd != null ? String(project.budget.dailyCostCapUsd) : "",
      budgetWeeklyCostCapUsd:
        project?.budget?.weeklyCostCapUsd != null ? String(project.budget.weeklyCostCapUsd) : "",
      budgetMonthlyCostCapUsd:
        project?.budget?.monthlyCostCapUsd != null ? String(project.budget.monthlyCostCapUsd) : "",
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
      const checks = checksText
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean);
      onSave({
        name: values.name.trim(),
        path: values.path.trim(),
        desc: values.desc.trim() || undefined,
        category: values.category || undefined,
        gitRemote: values.gitRemote.trim() || undefined,
        logo,
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

        <FormTextInput<ProjectEditValues>
          hint={t("fields.gitRemoteHint")}
          label={t("fields.gitRemote")}
          name="gitRemote"
          placeholder="git@github.com:org/repo.git"
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
            {t("fields.logo")}
          </Typography>
          <Stack align="center" direction="row" gap="150">
            <IconTile alt={watchedName || t("fields.logo")} glyph="code" size="xl" src={logo} />
            <Stack direction="row" gap="75">
              <Button
                icon="file"
                intent="ghost"
                onClick={() => logoInputRef.current?.click()}
                size="sm"
              >
                {t("fields.logoUpload")}
              </Button>
              {logo != null && (
                <Button icon="trash" intent="danger" onClick={() => setLogo(undefined)} size="sm">
                  {t("fields.logoRemove")}
                </Button>
              )}
            </Stack>
            {/* Native hidden attribute (not a style/className) — triggered from the Button above. */}
            <input
              hidden
              accept="image/*"
              data-testid="project-logo-input"
              onChange={handleLogoFile}
              ref={logoInputRef}
              type="file"
            />
          </Stack>
        </Stack>

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
          <Stack direction="row" gap="150">
            <FormTextInput<ProjectEditValues>
              inputMode="decimal"
              label={t("fields.budgetDailyCostCapUsd")}
              name="budgetDailyCostCapUsd"
              placeholder="—"
            />
            <FormTextInput<ProjectEditValues>
              inputMode="decimal"
              label={t("fields.budgetWeeklyCostCapUsd")}
              name="budgetWeeklyCostCapUsd"
              placeholder="—"
            />
            <FormTextInput<ProjectEditValues>
              inputMode="decimal"
              label={t("fields.budgetMonthlyCostCapUsd")}
              name="budgetMonthlyCostCapUsd"
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
