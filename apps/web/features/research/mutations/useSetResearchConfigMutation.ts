import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getResearchConfigQueryKey } from "../queries/useResearchConfigQuery";

/** Replace the operator research config (`PUT /api/research/config`); refreshes it on success. */
export function useSetResearchConfigMutation() {
  const qc = useQueryClient();
  return apiClient.research.putConfig.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getResearchConfigQueryKey() }),
  });
}
