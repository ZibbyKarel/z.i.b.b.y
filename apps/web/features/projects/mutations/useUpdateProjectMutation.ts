import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/** Partially update a project (`PATCH /api/projects/:id`); refreshes the registry. */
export const useUpdateProjectMutation = makeInvalidatingMutation(
  apiClient.projects.updateProject.useMutation,
  getProjectsQueryKey,
);
