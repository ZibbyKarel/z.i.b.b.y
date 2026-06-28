import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getIntegrationsQueryKey } from "../queries/useIntegrationsQuery";

/**
 * Set an integration's secret (`PUT /api/integrations/:id/credentials`). Write-only
 * — the secret is never read back; the catalog is refreshed so `hasCredentials`
 * flips to true.
 */
export const useSetCredentialsMutation = makeInvalidatingMutation(
  apiClient.integrations.setCredentials.useMutation,
  getIntegrationsQueryKey,
);
