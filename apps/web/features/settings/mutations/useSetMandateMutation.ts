import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getMandateQueryKey } from "../queries/useMandateQuery";

/** Replace the autonomy mandate (`PUT /api/mandate`); refreshes it on success. */
export const useSetMandateMutation = makeInvalidatingMutation(
  apiClient.mandate.setMandate.useMutation,
  getMandateQueryKey,
);
