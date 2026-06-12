import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getMandateQueryKey } from "../queries/useMandateQuery";

/** Replace the autonomy mandate (`PUT /api/mandate`); refreshes it on success. */
export function useSetMandateMutation() {
  const qc = useQueryClient();
  return apiClient.mandate.setMandate.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getMandateQueryKey() }),
  });
}
