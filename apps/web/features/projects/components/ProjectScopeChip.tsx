"use client";

import { Tag } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useActiveProject } from "../context/ProjectProvider";
import { useProjectsQuery } from "../queries";

export enum ProjectScopeChipTestId {
  Chip = "project-scope-chip",
}

/**
 * Active-scope indicator (Phase 24; began as Fáze 11): a DS `Tag` naming the
 * project — or "Bez projektu" — the current screen is scoped to, so a
 * filtered-empty list is never confusing. Always renders: there is no
 * "show everything" state to hide under. Placed by each scoped screen (runs,
 * memory, approval queue) in its header/toolbar.
 */
export function ProjectScopeChip() {
  const t = useTranslations("projects");
  const { activeProjectId } = useActiveProject();
  const { data: projects = [] } = useProjectsQuery();

  if (activeProjectId === null) {
    return (
      <Tag data-testid={ProjectScopeChipTestId.Chip} icon="code" tone="neutral">
        {t("scopeNone")}
      </Tag>
    );
  }
  const name = projects.find((p) => p.id === activeProjectId)?.name ?? activeProjectId;

  return (
    <Tag data-testid={ProjectScopeChipTestId.Chip} icon="code" tone="accent">
      {t("scopeActive", { name })}
    </Tag>
  );
}
