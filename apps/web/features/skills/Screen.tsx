"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Container,
  Icon,
  type IconName,
  Stack,
  Typography,
} from "@zibby/design-system";
import { type Skill, skillToAgent } from "../../domain";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { CardGrid } from "../../components/CardGrid/CardGrid";
import { SectionLabel } from "../../components/SectionLabel/SectionLabel";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { EntityFormModal, type FieldSchema } from "../../components/EntityFormModal/EntityFormModal";
import { CategoryDialog } from "../../components/CategoryDialog/CategoryDialog";
import { SkillTile } from "./components/SkillTile";
import { RunModal } from "./components/RunModal/RunModal";
import { useEntityForm } from "../../state/forms";
import { useSkillCategoriesQuery, useSkillsQuery } from "./queries";
import {
  useCreateSkillCategoryMutation,
  useCreateSkillMutation,
  useDeleteSkillCategoryMutation,
  useStartSkillRunMutation,
} from "./mutations";
import { useRunTargetProjects } from "../projects/useRunTargetProjects";

/** Slugify a free-form name into a filename-safe skill id. */
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "novy";

export function Screen() {
  const t = useTranslations("skills");
  const tk = useTranslations();
  const { data: skills = [] } = useSkillsQuery();
  const { data: categories = [] } = useSkillCategoriesQuery();
  const createSkill = useCreateSkillMutation();
  const startRun = useStartSkillRunMutation();
  const createCategory = useCreateSkillCategoryMutation();
  const deleteCategory = useDeleteSkillCategoryMutation();
  const runProjects = useRunTargetProjects();
  const [adding, setAdding] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [runSkill, setRunSkill] = useState<Skill | null>(null);
  const form = useEntityForm("skill");

  // Skills whose category was deleted (or never set) surface in a trailing
  // fallback section instead of vanishing from the catalog.
  const knownNames = new Set(categories.map((c) => c.name));
  const uncategorized = skills.filter((s) => !s.category || !knownNames.has(s.category));

  // The shared EntityFormModal is field-driven: add a category picker only when
  // at least one category exists, so a skill can be filed on creation.
  const fields: FieldSchema[] =
    categories.length > 0
      ? [
          ...form.fields,
          {
            name: "category",
            label: t("fields.category"),
            kind: "select",
            options: categories.map((c) => ({ value: c.name, label: c.name })),
          },
        ]
      : form.fields;

  const renderSection = (key: string, label: string, glyph: IconName, items: Skill[]) => {
    const empty = items.length === 0;
    return (
      <Container key={key}>
        <SectionLabel
          action={
            <Stack align="center" direction="row" gap="100">
              <Typography mono size="xs" type="note" variant="tertiary">
                {items.length}
              </Typography>
              {empty && key !== "__uncategorized" && (
                <Button
                  aria-label={t("deleteEmptyCategoryAria", { name: label })}
                  icon="x"
                  intent="reject"
                  onClick={() => deleteCategory.mutate({ params: { name: label } })}
                  size="sm"
                >
                  {t("deleteEmptyCategory")}
                </Button>
              )}
            </Stack>
          }
        >
          <Stack inline align="center" as="span" direction="row" gap="50">
            <Icon name={glyph} size="sm" tone="accent" /> {label}
          </Stack>
        </SectionLabel>
        {empty ? (
          <Card background="background" radius="sm">
            <Container padding="200">
              <Stack align="center">
                <Typography mono size="sm" type="note" variant="tertiary">
                  {t("emptyCategory")}
                </Typography>
              </Stack>
            </Container>
          </Card>
        ) : (
          <CardGrid>
            {items.map((s) => (
              <SkillTile key={s.id} onRun={setRunSkill} skill={s} />
            ))}
          </CardGrid>
        )}
      </Container>
    );
  };

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            <>
              <Button icon="plus" intent="ghost" onClick={() => setAddingCategory(true)}>
                {t("addCategory")}
              </Button>
              <Button icon="plus" intent="run" onClick={() => setAdding(true)}>
                {t("addSkill")}
              </Button>
            </>
          }
          subtitle={t("countSummary", { count: skills.length })}
          title={t("title")}
        />

        {categories.length === 0 && skills.length === 0 ? (
          <EmptyState
            actionLabel={t("addSkill")}
            description={t("emptyDescription")}
            glyph="spark"
            hint={t("emptyHint")}
            onAction={() => setAdding(true)}
            title={t("emptyTitle")}
          />
        ) : (
          <>
            {categories.map((cat) =>
              renderSection(
                cat.name,
                cat.name,
                (cat.glyph as IconName) ?? "spark",
                skills.filter((s) => s.category === cat.name),
              ),
            )}
            {uncategorized.length > 0 &&
              renderSection("__uncategorized", t("uncategorized"), "spark", uncategorized)}
          </>
        )}
      </Stack>

      {adding && (
        <EntityFormModal
          fields={fields}
          filePreview={form.filePreview}
          glyph={form.glyph}
          onClose={() => setAdding(false)}
          onSubmit={(values) => {
            const id = slug(values.name ?? "");
            const desc = values.desc?.trim() || tk("defaults.skill");
            createSkill.mutate(
              {
                body: {
                  id,
                  name: values.name?.trim() || id,
                  glyph: "spark",
                  desc,
                  category: values.category?.trim() || undefined,
                  // The form captures no body yet; seed instructions from the
                  // description so the SKILL.md has a non-empty body to start from.
                  instructions: desc,
                },
              },
              { onSuccess: () => setAdding(false) },
            );
          }}
          submitLabel={form.submitLabel}
          subtitle={form.subtitle}
          title={form.title}
        />
      )}

      {addingCategory && (
        <CategoryDialog
          existing={categories.map((c) => c.name)}
          labels={{
            title: t("categoryDialog.title"),
            subtitle: t("categoryDialog.subtitle"),
            nameLabel: t("categoryDialog.nameLabel"),
            namePlaceholder: t("categoryDialog.namePlaceholder"),
            glyphLabel: t("categoryDialog.glyphLabel"),
            submit: t("addCategory"),
            duplicate: (name) => t("categoryDialog.duplicate", { name }),
          }}
          onClose={() => setAddingCategory(false)}
          onSubmit={(category) =>
            createCategory.mutate({ body: category }, { onSuccess: () => setAddingCategory(false) })
          }
          pending={createCategory.isPending}
        />
      )}

      {runSkill && (
        <RunModal
          agent={skillToAgent(runSkill)}
          file={runSkill.file}
          key={runSkill.id}
          onClose={() => setRunSkill(null)}
          onLaunch={({ prompt, project }) =>
            startRun.mutate({ params: { id: runSkill.id }, body: { prompt, project } })
          }
          projects={runProjects}
        />
      )}
    </PageContainer>
  );
}
