import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getIntegrationsQueryKey } from "../queries/useIntegrationsQuery";

/** Delete an integration (`DELETE /api/integrations/:id`); cascades credentials server-side. */
export const useDeleteIntegrationMutation = makeInvalidatingMutation(
  apiClient.integrations.deleteIntegration.useMutation,
  getIntegrationsQueryKey,
);
