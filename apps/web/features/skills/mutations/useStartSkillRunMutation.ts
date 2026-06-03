import { apiClient } from "../../../state/api";

/** Start a skill run (`POST /api/skills/:id/run`). */
export function useStartSkillRunMutation() {
  return apiClient.skillRuns.startSkillRun.useMutation();
}
