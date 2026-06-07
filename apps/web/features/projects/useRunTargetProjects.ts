import { useProjectsQuery } from "./queries";

export function useRunTargetProjects(): string[] {
  const { data: projects = [] } = useProjectsQuery();
  return projects.map((p) => p.name);
}
