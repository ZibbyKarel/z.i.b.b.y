"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Button,
  Container,
  Dialog,
  IconTile,
  Pressable,
  Stack,
  StatusDot,
  Tag,
  Typography,
} from "@zibby/design-system";
import type { Category, Project } from "@zibby/contracts";
import { Controller, FormTextInput, useFormControls } from "@zibby/forms";
import { KeyValueEditor, type KeyValueRow } from "./KeyValueEditor";

export interface ProjectModalProps {
  project: Project;
  isNew: boolean;
  categories: Category[];
  onClose: () => void;
  onSave: (project: Project, isNew: boolean) => void;
  onDelete: (id: string) => void;
  /** Persist write-only run secrets for an existing project. */
  onSetSecrets?: (id: string, secrets: Record<string, string>) => void;
  /** Remove an existing project's stored run secrets. */
  onDeleteSecrets?: (id: string) => void;
  /** Secrets mutation in flight (disables the secrets controls). */
  settingSecrets?: boolean;
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
 * Editor for a project (target directory): name, host path, category and
 * description. Opens straight into the form (projects have no read-only
 * view), with a guarded delete that only removes the registry record.
 */
export function ProjectModal({
  project,
  isNew,
  categories,
  onClose,
  onSave,
  onDelete,
  onSetSecrets,
  onDeleteSecrets,
  settingSecrets,
}: ProjectModalProps) {
  const t = useTranslations("projects");
  const tk = useTranslations();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [envRows, setEnvRows] = useState<KeyValueRow[]>(toRows(project.env));
  const [secretRows, setSecretRows] = useState<KeyValueRow[]>([]);

  const { renderForm, submit, form } = useFormControls<ProjectEditValues>({
    defaultValues: {
      name: project.name ?? "",
      path: project.path ?? "~/Projects/",
      desc: project.desc ?? "",
      category: project.category ?? categories[0]?.name ?? "",
      budgetDailyRuns: project.budget?.dailyRuns != null ? String(project.budget.dailyRuns) : "",
      budgetWeeklyRuns: project.budget?.weeklyRuns != null ? String(project.budget.weeklyRuns) : "",
      budgetMonthlyRuns: project.budget?.monthlyRuns != null ? String(project.budget.monthlyRuns) : "",
      budgetMaxConcurrent:
        project.budget?.maxConcurrent != null ? String(project.budget.maxConcurrent) : "",
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
      onSave(
        {
          ...project,
          name: values.name.trim(),
          path: values.path.trim(),
          desc: values.desc.trim() || undefined,
          category: values.category || undefined,
          budget,
          env: fromRows(envRows),
        },
        isNew,
      );
    },
  });

  const [watchedName, watchedPath] = form.watch(["name", "path"]);
  const canSave =
    (watchedName ?? "").trim().length > 0 && (watchedPath ?? "").trim().length > 0;

  const actions = (
    <Stack grow align="center" direction="row" justify="between">
      {!isNew ? (
        <Button icon="x" intent="danger" onClick={() => setConfirm(true)} size="sm">
          {t("delete")}
        </Button>
      ) : (
        <span />
      )}
      <Stack align="center" direction="row" gap="100">
        {!isNew && (
          <Button
            icon="gear"
            intent="ghost"
            onClick={() => { onClose(); router.push(`/projects/${project.id}`); }}
            size="sm"
          >
            {t("profile.link")}
          </Button>
        )}
        <Button intent="ghost" onClick={onClose}>
          {tk("common.cancel")}
        </Button>
        <Button disabled={!canSave} icon={isNew ? "plus" : "check"} intent="primary" onClick={() => void submit()}>
          {isNew ? t("create") : t("save")}
        </Button>
      </Stack>
    </Stack>
  );

  return renderForm(
    <>
      <Dialog
        actions={actions}
        ariaLabel={isNew ? t("newProject") : project.name}
        closeLabel={tk("common.close")}
        onClose={onClose}
        open={!confirm}
        title={
          <Stack align="center" direction="row" gap="150">
            <IconTile glyph="code" size="md" />
            <Container grow minW0>
              <Typography mono truncate size="xl" type="note" weight="bold">
                {isNew ? t("newProject") : project.name}
              </Typography>
              <Typography mono size="xs" type="note" variant="tertiary">
                {t("modalSubtitle")}
              </Typography>
            </Container>
          </Stack>
        }
        width="lg"
      >
        <Stack gap="200">
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

          {!isNew && onSetSecrets && (
            <Stack gap="75">
              <Stack align="center" direction="row" gap="100">
                <Typography mono size="sm" type="note" variant="secondary">
                  {t("fields.secrets")}
                </Typography>
                <Tag tone={project.hasSecrets ? "accent" : "neutral"}>
                  <StatusDot size="75" tone={project.hasSecrets ? "ok" : "idle"} />
                  {project.hasSecrets ? t("fields.secretsStored") : t("fields.secretsNone")}
                </Tag>
              </Stack>
              <Typography size="xs" type="note" variant="tertiary">
                {t("fields.secretsHint")}
              </Typography>
              <KeyValueEditor
                secret
                addLabel={t("fields.secretsAdd")}
                keyLabel={t("fields.secretsKey")}
                keyPlaceholder="OPENAI_API_KEY"
                onChange={setSecretRows}
                removeLabel={t("fields.secretsRemove")}
                rows={secretRows}
                testIdPrefix="project-secret"
                valueLabel={t("fields.secretsValue")}
                valuePlaceholder="sk-…"
              />
              <Stack align="center" direction="row" gap="100">
                <Button
                  data-testid="project-secrets-save"
                  disabled={settingSecrets || fromRows(secretRows) === undefined}
                  icon="check"
                  intent="ghost"
                  onClick={() => {
                    const secrets = fromRows(secretRows);
                    if (!secrets) return;
                    onSetSecrets(project.id, secrets);
                    setSecretRows([]);
                  }}
                  size="sm"
                >
                  {t("fields.secretsSave")}
                </Button>
                {project.hasSecrets && onDeleteSecrets && (
                  <Button
                    disabled={settingSecrets}
                    icon="trash"
                    intent="danger"
                    onClick={() => onDeleteSecrets(project.id)}
                    size="sm"
                  >
                    {t("fields.secretsClear")}
                  </Button>
                )}
              </Stack>
            </Stack>
          )}
        </Stack>
      </Dialog>

      {confirm && (
        <Dialog
          open
          actions={
            <>
              <Button intent="ghost" onClick={() => setConfirm(false)}>
                {tk("common.cancel")}
              </Button>
              <Button
                icon="x"
                intent="danger"
                onClick={() => {
                  setConfirm(false);
                  onDelete(project.id);
                }}
              >
                {t("delete")}
              </Button>
            </>
          }
          onClose={() => setConfirm(false)}
          title={t("deleteTitle")}
          width="sm"
        >
          <Typography size="base" type="note" variant="secondary">
            {t("deleteBody", { name: project.name })}
          </Typography>
        </Dialog>
      )}
    </>,
  );
}
