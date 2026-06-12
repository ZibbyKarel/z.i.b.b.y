import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getIntegrationsQueryKey } from "../queries/useIntegrationsQuery";

/**
 * Set an integration's secret (`PUT /api/integrations/:id/credentials`). Write-only
 * — the secret is never read back; the catalog is refreshed so `hasCredentials`
 * flips to true.
 */
export function useSetCredentialsMutation() {
  const qc = useQueryClient();
  return apiClient.integrations.setCredentials.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getIntegrationsQueryKey() }),
  });
}
