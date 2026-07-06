"use client";

import { Container, Dropdown, type DropdownOption } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useActiveProject } from "../context/ProjectProvider";
import { useProjectsQuery } from "../queries";

export enum ProjectSwitcherTestId {
  Root = "project-switcher",
}

/**
 * Sentinel for "Všechny projekty". The DS `Dropdown` is a single-select over
 * string values and real project ids are non-empty, so `""` is safe.
 */
const ALL_PROJECTS = "";

/**
 * The one app-wide project switcher (Fáze 11) — a domain composite mounted at a
 * single consistent spot in the `AppShell` chrome (the top bar, next to the
 * breadcrumb), the same place on every screen.
 *
 * DS primitive decision: composed from the existing `Dropdown` (inline
 * single-select variant — the same primitive the `LanguageSwitcher` uses), so the
 * current selection stays permanently visible in the trigger. No new primitive.
 */
export function ProjectSwitcher() {
  const t = useTranslations("projects");
  const { activeProjectId, setActiveProject } = useActiveProject();
  const { data: projects = [] } = useProjectsQuery();

  const options: DropdownOption<string>[] = [
    { value: ALL_PROJECTS, label: t("switcherAll") },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <Container data-testid={ProjectSwitcherTestId.Root} shrink={false}>
      <Dropdown<string>
        aria-label={t("switcherLabel")}
        onChange={(value) => setActiveProject(value === ALL_PROJECTS ? null : value)}
        options={options}
        value={activeProjectId ?? ALL_PROJECTS}
      />
    </Container>
  );
}
