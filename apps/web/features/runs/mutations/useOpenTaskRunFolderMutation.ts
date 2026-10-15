import { apiClient } from "../../../state/api";

/** Open a workflow run's output folder in Finder via `POST /api/tasks/runs/:runId/open-folder`. */
export function useOpenTaskRunFolderMutation() {
  return apiClient.taskRuns.openTaskRunFolder.useMutation();
}
