"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Chip,
  Container,
  Dialog,
  IconTile,
  Pressable,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Category, Project, ProjectContext } from "@zibby/contracts";
import { Controller, FormTextInput, useFormControls } from "@zibby/forms";

export interface ProjectModalProps {
  project: Project;
  isNew: boolean;
  categories: Category[];
  onClose: () => void;
  onSave: (project: Project, isNew: boolean) => void;
  onDelete: (id: string) => void;
}

type ProjectEditValues = {
  name: string;
  path: string;
  desc: string;
  ctx: ProjectContext;
  category: string;
};

const CONTEXTS: ProjectContext[] = ["work", "home"];

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
      <Chip tone={active ? "accent" : "neutral"}>{children}</Chip>
    </Pressable>
  );
}

/**
 * Editor for a project (target directory): name, host path, category, description
 * and work/home context. Opens straight into the form (projects have no read-only
 * view), with a guarded delete that only removes the registry record.
 */
export function ProjectModal({
  project,
  isNew,
  categories,
  onClose,
  onSave,
  onDelete,
}: ProjectModalProps) {
  const t = useTranslations("projects");
  const tk = useTranslations();
  const [confirm, setConfirm] = useState(false);

  const { renderForm, submit, form } = useFormControls<ProjectEditValues>({
    defaultValues: {
      name: project.name ?? "",
      path: project.path ?? "~/Projects/",
      desc: project.desc ?? "",
      ctx: project.ctx ?? "work",
      category: project.category ?? categories[0]?.name ?? "",
    },
    onSubmit: (values) => {
      onSave(
        {
          ...project,
          name: values.name.trim(),
          path: values.path.trim(),
          desc: values.desc.trim() || undefined,
          ctx: values.ctx,
          category: values.category || undefined,
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
        <Button icon="x" intent="reject" onClick={() => setConfirm(true)} size="sm">
          {t("delete")}
        </Button>
      ) : (
        <span />
      )}
      <Stack align="center" direction="row" gap="100">
        <Button intent="ghost" onClick={onClose}>
          {tk("common.cancel")}
        </Button>
        <Button disabled={!canSave} icon={isNew ? "plus" : "check"} intent="run" onClick={() => void submit()}>
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

          <Controller<ProjectEditValues, "ctx">
            control={form.control}
            name="ctx"
            render={({ field }) => (
              <Stack gap="75">
                <Typography mono size="sm" type="note" variant="secondary">
                  {t("fields.context")}
                </Typography>
                <Stack wrap direction="row" gap="75">
                  {CONTEXTS.map((c) => (
                    <ChipToggle
                      active={field.value === c}
                      key={c}
                      onClick={() => field.onChange(c)}
                    >
                      {c}
                    </ChipToggle>
                  ))}
                </Stack>
              </Stack>
            )}
          />
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
                intent="reject"
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
