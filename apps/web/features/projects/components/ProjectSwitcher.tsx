"use client";

import { Container } from "@zibby/design-system";
import { useActiveProject } from "../context/ProjectProvider";
import { useProjectsQuery } from "../queries";
import { ProjectSelect } from "./ProjectSelect";

export enum ProjectSwitcherTestId {
  Root = "project-switcher",
}

/**
 * The standalone project switcher (Phase 24; began as Fáze 11) — a domain
 * composite that used to be mounted at one consistent spot in the `AppShell` chrome
 * (the top bar) and the chat header. Phase 102 relocated that control surface
 * inline into `CommandLine` (via the same shared {@link ProjectSelect}) and
 * unmounted this component from both hosts; it's kept as a generic standalone
 * switcher for any future non-CommandLine host, not currently rendered anywhere.
 */
export function ProjectSwitcher() {
  const { activeProjectId, setActiveProject } = useActiveProject();
  const { data: projects = [] } = useProjectsQuery();

  return (
    <Container data-testid={ProjectSwitcherTestId.Root} shrink={false}>
      <ProjectSelect
        activeProjectId={activeProjectId}
        onChange={setActiveProject}
        projects={projects}
      />
    </Container>
  );
}
