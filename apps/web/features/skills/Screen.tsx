"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Container,
  Grid,
  Icon,
  type IconName,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Skill } from "../../domain";
import { ImmersivePage } from "../../components/layout/ImmersivePage/ImmersivePage";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SectionLabel } from "../../components/SectionLabel/SectionLabel";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { CategoryDialog } from "../../components/CategoryDialog/CategoryDialog";
import { AddSkillModal } from "./components/AddSkillModal/AddSkillModal";
import { SkillTile } from "./components/SkillTile";
import { useSkillCategoriesQuery, useSkillsQuery } from "./queries";
import {
  useCreateSkillCategoryMutation,
  useCreateSkillMutation,
  useDeleteSkillCategoryMutation,
} from "./mutations";
import { slug } from "../../utils/slug";

export function Screen() {
  const t = useTranslations("skills");
  const tk = useTranslations();
  const router = useRouter();
  const skillsQuery = useSkillsQuery();
  const skills = skillsQuery.data ?? [];
  const { data: categories = [] } = useSkillCategoriesQuery();
  const createSkill = useCreateSkillMutation();
  const createCategory = useCreateSkillCategoryMutation();
  const deleteCategory = useDeleteSkillCategoryMutation();
  const [adding, setAdding] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);

  // Skills whose category was deleted (or never set) surface in a trailing
  // fallback section instead of vanishing from the catalog.
  const knownNames = new Set(categories.map((c) => c.name));
  const uncategorized = skills.filter((s) => !s.category || !knownNames.has(s.category));

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
                  intent="danger"
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
          <Grid cols={1} gap="150" lg={3} sm={2}>
            {items.map((s) => (
              <SkillTile
                key={s.id}
                onSelect={() => router.push(`/skills/${s.id}`)}
                selectLabel={t("openSkillAria", { name: s.name })}
                skill={s}
              />
            ))}
          </Grid>
        )}
      </Container>
    );
  };

  return (
    <ImmersivePage
      actions={
        <>
          <Button icon="plus" intent="ghost" onClick={() => setAddingCategory(true)}>
            {t("addCategory")}
          </Button>
          <Button icon="plus" intent="primary" onClick={() => setAdding(true)}>
            {t("addSkill")}
          </Button>
        </>
      }
      subtitle={t("countSummary", { count: skills.length })}
      title={t("title")}
    >
      <Container padding={["300", "350"]}>
        <PageContainer>
          <Stack gap="250">
            {skillsQuery.isPending ? (
              <QueryLoading />
            ) : skillsQuery.isError ? (
              <QueryError onRetry={() => void skillsQuery.refetch()} />
            ) : categories.length === 0 && skills.length === 0 ? (
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
        </PageContainer>
      </Container>

      {adding && (
        <AddSkillModal
          categories={categories.map((c) => c.name)}
          onClose={() => setAdding(false)}
          onSubmit={({ name, desc, category, glyph, instructions }) => {
            const id = slug(name, "novy");
            // Description and body both fall back so the SKILL.md is never empty,
            // even when the user creates a skill from name alone.
            const safeDesc = desc || tk("defaults.skill");
            createSkill.mutate(
              {
                body: {
                  id,
                  name: name || id,
                  glyph,
                  desc: safeDesc,
                  category,
                  instructions: instructions || safeDesc,
                },
              },
              {
                // Grammar (N4d): the dialog only births the skill; editing lives
                // on the detail page — navigate straight to it.
                onSuccess: () => {
                  setAdding(false);
                  router.push(`/skills/${id}`);
                },
              },
            );
          }}
          pending={createSkill.isPending}
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
    </ImmersivePage>
  );
}
