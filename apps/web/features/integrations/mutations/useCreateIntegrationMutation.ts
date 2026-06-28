import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getIntegrationsQueryKey } from "../queries/useIntegrationsQuery";

/** Create an integration (`POST /api/integrations`); refreshes the catalog on success. */
export const useCreateIntegrationMutation = makeInvalidatingMutation(
  apiClient.integrations.createIntegration.useMutation,
  getIntegrationsQueryKey,
);
