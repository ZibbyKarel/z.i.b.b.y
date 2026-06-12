import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getIntegrationsQueryKey } from "../queries/useIntegrationsQuery";

/** Delete an integration (`DELETE /api/integrations/:id`); cascades credentials server-side. */
export function useDeleteIntegrationMutation() {
  const qc = useQueryClient();
  return apiClient.integrations.deleteIntegration.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getIntegrationsQueryKey() }),
  });
}
