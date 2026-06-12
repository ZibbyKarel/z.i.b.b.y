import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getIntegrationsQueryKey } from "../queries/useIntegrationsQuery";

/**
 * Test an integration's connection (`POST /api/integrations/:id/test`). The server
 * stamps `status` from the result, so the catalog is refreshed on success to pick
 * up the new connection state.
 */
export function useTestIntegrationMutation() {
  const qc = useQueryClient();
  return apiClient.integrations.testIntegration.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getIntegrationsQueryKey() }),
  });
}
