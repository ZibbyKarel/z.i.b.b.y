"use client";

import { Tag } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useActiveProject } from "../context/ProjectProvider";
import { useProjectsQuery } from "../queries";

export enum ProjectScopeChipTestId {
  Chip = "project-scope-chip",
}

/**
 * Subtle active-filter indicator (Fáze 11): a DS `Tag` naming the project the
 * current screen is scoped to, so a filtered-empty list is never confusing.
 * Renders nothing under "Všechny projekty". Placed by each scoped screen
 * (runs, memory, approval queue) in its header/toolbar.
 */
export function ProjectScopeChip() {
  const t = useTranslations("projects");
  const { activeProjectId } = useActiveProject();
  const { data: projects = [] } = useProjectsQuery();

  if (activeProjectId === null) return null;
  const name = projects.find((p) => p.id === activeProjectId)?.name ?? activeProjectId;

  return (
    <Tag data-testid={ProjectScopeChipTestId.Chip} icon="code" tone="accent">
      {t("scopeActive", { name })}
    </Tag>
  );
}
