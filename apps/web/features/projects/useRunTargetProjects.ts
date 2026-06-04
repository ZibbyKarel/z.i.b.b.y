import { PROJECTS } from "../../state/config";
import { useProjectsQuery } from "./queries";

/**
 * Project names offered as run targets in the RunModal. Sourced from the live
 * project registry (`GET /api/projects`); falls back to the static seed list while
 * the registry is empty so the picker is never blank on a fresh install.
 */
export function useRunTargetProjects(): string[] {
  const { data: projects = [] } = useProjectsQuery();
  return projects.length > 0 ? projects.map((p) => p.name) : [...PROJECTS];
}
