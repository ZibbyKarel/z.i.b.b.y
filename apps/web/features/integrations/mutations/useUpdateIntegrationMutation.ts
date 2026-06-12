import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getIntegrationsQueryKey } from "../queries/useIntegrationsQuery";

/** Update an integration (`PATCH /api/integrations/:id`); refreshes the catalog on success. */
export function useUpdateIntegrationMutation() {
  const qc = useQueryClient();
  return apiClient.integrations.updateIntegration.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getIntegrationsQueryKey() }),
  });
}
