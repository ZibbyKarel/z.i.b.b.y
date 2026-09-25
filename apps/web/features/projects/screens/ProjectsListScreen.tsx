"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Button,
  Container,
  Grid,
  Icon,
  type IconName,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Project } from "@zibby/contracts";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { SectionLabel } from "../../../components/SectionLabel/SectionLabel";
import { CategoryDialog } from "../../../components/CategoryDialog/CategoryDialog";
import { ProjectCard } from "../components/ProjectCard";
import { useBudgetQuery, useProjectCategoriesQuery, useProjectsQuery } from "../queries";
import { useCreateProjectCategoryMutation, useDeleteProjectCategoryMutation } from "../mutations";

/**
 * `/work/projects` (ZB-06) — the project catalog, moved from `/projects`.
 * Category taxonomy is unchanged; only the header (`Container`/eyebrow/`h1`,
 * matching Companies/Teams/Tasks) and the detail routes moved under `/work`.
 */
export function ProjectsListScreen() {
  const t = useTranslations("projects");
  const router = useRouter();
  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data ?? [];
  const { data: categories = [] } = useProjectCategoriesQuery();
  const { data: budget } = useBudgetQuery();
  const budgetByProject = new Map((budget?.projects ?? []).map((p) => [p.projectId, p]));
  const createCategory = useCreateProjectCategoryMutation();
  const deleteCategory = useDeleteProjectCategoryMutation();

  const [addingCategory, setAddingCategory] = useState(false);

  // Projects whose category was deleted (or never set) surface in a trailing
  // fallback section instead of vanishing from the catalog.
  const knownNames = new Set(categories.map((c) => c.name));
  const uncategorized = projects.filter((p) => !p.category || !knownNames.has(p.category));

  const openProject = (p: Project) => router.push(`/work/projects/${p.id}` as Route);
  const addProject = () => router.push("/work/projects/new" as Route);

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
          <Container padding="200">
            <Stack align="center">
              <Typography mono size="sm" type="note" variant="tertiary">
                {t("emptyCategory")}
              </Typography>
            </Stack>
          </Container>
        ) : (
          <Grid cols={1} gap="150" lg={3} sm={2}>
            {items.map((p) => (
              <ProjectCard
                budget={budgetByProject.get(p.id)}
                key={p.id}
                onOpen={openProject}
                project={p}
              />
            ))}
          </Grid>
        )}
      </Container>
    );
  };

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="200">
          <Stack wrap align="baseline" direction="row" gap="150" justify="between">
            <Stack wrap align="baseline" direction="row" gap="150">
              <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
                {t("eyebrow")}
              </Typography>
              <Typography type="h1">{t("title")}</Typography>
            </Stack>
            <Stack direction="row" gap="100">
              <Button icon="plus" intent="ghost" onClick={() => setAddingCategory(true)}>
                {t("addCategory")}
              </Button>
              <Button icon="plus" intent="primary" onClick={addProject}>
                {t("addProject")}
              </Button>
            </Stack>
          </Stack>

          <Typography size="sm" type="note" variant="secondary">
            {t("countSummary", { count: projects.length })}
          </Typography>

          {projectsQuery.isPending ? (
            <QueryLoading />
          ) : projectsQuery.isError ? (
            <QueryError onRetry={() => void projectsQuery.refetch()} />
          ) : categories.length === 0 && projects.length === 0 ? (
            <EmptyState
              actionLabel={t("addProject")}
              description={t("emptyDescription")}
              glyph="code"
              hint={t("emptyHint")}
              onAction={addProject}
              title={t("emptyTitle")}
            />
          ) : (
            <Stack gap="250">
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
            </Stack>
          )}
        </Stack>
      </PageContainer>

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
    </Container>
  );
}
