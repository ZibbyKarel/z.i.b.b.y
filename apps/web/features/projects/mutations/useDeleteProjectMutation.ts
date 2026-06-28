import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/**
 * Delete a project (`DELETE /api/projects/:id`). Removes only the registry record;
 * the files it points at on disk are untouched. Refreshes the registry on success.
 */
export const useDeleteProjectMutation = makeInvalidatingMutation(
  apiClient.projects.deleteProject.useMutation,
  getProjectsQueryKey,
);
