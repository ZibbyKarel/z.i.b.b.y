import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectsQueryKey } from "../../projects/queries/useProjectsQuery";
import { getSelfStatusQueryKey } from "../queries/useSelfStatusQuery";

/**
 * Register ZIBBY itself as a project (`POST /api/self/project`, idempotent) so
 * self-edit runs in a separate clone and lands as a draft PR. 409 (no origin,
 * a conflicting `zibby` project, clone == install) arrives as an error — the
 * call site reads the body's `message`. Refreshes the self status (`projectId`)
 * and the projects registry.
 */
export function useEnsureSelfProjectMutation() {
  const queryClient = useQueryClient();
  return apiClient.self.ensureSelfProject.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getSelfStatusQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getProjectsQueryKey() });
    },
  });
}
