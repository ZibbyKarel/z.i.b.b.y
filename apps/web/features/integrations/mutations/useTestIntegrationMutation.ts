import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getIntegrationsQueryKey } from "../queries/useIntegrationsQuery";

/**
 * Test an integration's connection (`POST /api/integrations/:id/test`). The server
 * stamps `status` from the result, so the catalog is refreshed on success to pick
 * up the new connection state.
 */
export const useTestIntegrationMutation = makeInvalidatingMutation(
  apiClient.integrations.testIntegration.useMutation,
  getIntegrationsQueryKey,
);
