import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getIntegrationsQueryKey } from "../queries/useIntegrationsQuery";

/** Create an integration (`POST /api/integrations`); refreshes the catalog on success. */
export function useCreateIntegrationMutation() {
  const qc = useQueryClient();
  return apiClient.integrations.createIntegration.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getIntegrationsQueryKey() }),
  });
}
