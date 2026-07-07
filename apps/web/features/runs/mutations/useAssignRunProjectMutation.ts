import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { allTaskRunsKey } from "../queries/useRunsQuery";

/**
 * Assign (or clear, with `projectId: null`) a run's project
 * (`PATCH /api/tasks/runs/:runId/project`) — Phase 24 Part D's reassignment path
 * for a project-less ("bez projektu") run. Refreshes the feed on success so the
 * run's card/detail immediately reflects its new engagement.
 */
export function useAssignRunProjectMutation() {
  const qc = useQueryClient();
  return apiClient.taskRuns.assignTaskRunProject.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: allTaskRunsKey }),
  });
}
