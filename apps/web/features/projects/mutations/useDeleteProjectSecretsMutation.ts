import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/** Remove a project's stored run secrets (`DELETE /api/projects/:id/secrets`). */
export const useDeleteProjectSecretsMutation = makeInvalidatingMutation(
  apiClient.projects.deleteProjectSecrets.useMutation,
  getProjectsQueryKey,
);
