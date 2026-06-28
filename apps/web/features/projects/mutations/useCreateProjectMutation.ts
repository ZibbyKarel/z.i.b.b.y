import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/** Create a project (`POST /api/projects`); refreshes the registry on success. */
export const useCreateProjectMutation = makeInvalidatingMutation(
  apiClient.projects.createProject.useMutation,
  getProjectsQueryKey,
);
