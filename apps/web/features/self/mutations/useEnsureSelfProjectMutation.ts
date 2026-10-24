import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectsQueryKey } from "../../projects/queries/useProjectsQuery";
import { getSelfStatusQueryKey } from "../queries/useSelfStatusQuery";

/**
 * Register ZIBBY itself as a project (`POST /api/self/project`, idempotent — an
 * existing self project is recognised, not duplicated) so self-edit runs in a
 * separate clone and lands as a draft PR. A 409 (no origin, a conflicting
 * `zibby` project, clone == install) is thrown by ts-rest and arrives in
 * `onError`; the call site shows the body's `message` inline, so
 * `meta.inlineError` keeps the global toast quiet. Refreshes the self status
 * (`projectId`) and the projects registry on ANY outcome (`onSettled`).
 */
export function useEnsureSelfProjectMutation() {
  const queryClient = useQueryClient();
  return apiClient.self.ensureSelfProject.useMutation({
    meta: { inlineError: true },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: getSelfStatusQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getProjectsQueryKey() });
    },
  });
}
