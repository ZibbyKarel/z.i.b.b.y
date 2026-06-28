import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getIntegrationsQueryKey } from "../queries/useIntegrationsQuery";

/** Update an integration (`PATCH /api/integrations/:id`); refreshes the catalog on success. */
export const useUpdateIntegrationMutation = makeInvalidatingMutation(
  apiClient.integrations.updateIntegration.useMutation,
  getIntegrationsQueryKey,
);
