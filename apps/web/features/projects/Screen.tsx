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
import type { Project } from "@zibby/contracts";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { CardGrid } from "../../components/CardGrid/CardGrid";
import { SectionLabel } from "../../components/SectionLabel/SectionLabel";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { CategoryDialog } from "../../components/CategoryDialog/CategoryDialog";
import { ProjectCard } from "./components/ProjectCard";
import { ProjectModal } from "./components/ProjectModal";
import { useProjectCategoriesQuery, useProjectsQuery } from "./queries";
import {
  useCreateProjectCategoryMutation,
  useCreateProjectMutation,
  useDeleteProjectCategoryMutation,
  useDeleteProjectMutation,
  useUpdateProjectMutation,
} from "./mutations";

/** Slugify a free-form name into a filename-safe project id (mirrors agents). */
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function newProjectDraft(category?: string): Project {
  return { id: "", name: "", path: "~/Projects/", desc: "", ctx: "work", category };
}

export function Screen() {
  const t = useTranslations("projects");
  const { data: projects = [] } = useProjectsQuery();
  const { data: categories = [] } = useProjectCategoriesQuery();
  const createProject = useCreateProjectMutation();
  const updateProject = useUpdateProjectMutation();
  const deleteProject = useDeleteProjectMutation();
  const createCategory = useCreateProjectCategoryMutation();
  const deleteCategory = useDeleteProjectCategoryMutation();

  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Project | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);

  // Projects whose category was deleted (or never set) surface in a trailing
  // fallback section instead of vanishing from the catalog.
  const knownNames = new Set(categories.map((c) => c.name));
  const uncategorized = projects.filter((p) => !p.category || !knownNames.has(p.category));

  const openProject = openId ? (projects.find((p) => p.id === openId) ?? null) : null;

  const save = (p: Project, isNew: boolean) => {
    if (isNew) {
      const id = slug(p.name) || `project-${Date.now()}`;
      createProject.mutate({ body: { ...p, id } }, { onSuccess: () => setDraft(null) });
    } else {
      const { id, ...body } = p;
      updateProject.mutate({ params: { id }, body }, { onSuccess: () => setOpenId(null) });
    }
  };

  const renderSection = (key: string, label: string, glyph: IconName, items: Project[]) => {
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
            {items.map((p) => (
              <ProjectCard key={p.id} onOpen={(x) => setOpenId(x.id)} project={p} />
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
              <Button
                icon="plus"
                intent="run"
                onClick={() => setDraft(newProjectDraft(categories[0]?.name))}
              >
                {t("addProject")}
              </Button>
            </>
          }
          subtitle={t("countSummary", { count: projects.length })}
          title={t("title")}
        />

        {categories.length === 0 && projects.length === 0 ? (
          <EmptyState
            actionLabel={t("addProject")}
            description={t("emptyDescription")}
            glyph="code"
            hint={t("emptyHint")}
            onAction={() => setDraft(newProjectDraft())}
            title={t("emptyTitle")}
          />
        ) : (
          <>
            {categories.map((cat) =>
              renderSection(
                cat.name,
                cat.name,
                (cat.glyph as IconName) ?? "code",
                projects.filter((p) => p.category === cat.name),
              ),
            )}
            {uncategorized.length > 0 &&
              renderSection("__uncategorized", t("uncategorized"), "code", uncategorized)}
          </>
        )}
      </Stack>

      {openProject && (
        <ProjectModal
          categories={categories}
          isNew={false}
          key={openProject.id}
          onClose={() => setOpenId(null)}
          onDelete={(id) =>
            deleteProject.mutate({ params: { id } }, { onSuccess: () => setOpenId(null) })
          }
          onSave={save}
          project={openProject}
        />
      )}

      {draft && (
        <ProjectModal
          isNew
          categories={categories}
          key="new-project"
          onClose={() => setDraft(null)}
          onDelete={() => setDraft(null)}
          onSave={save}
          project={draft}
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
    </PageContainer>
  );
}
