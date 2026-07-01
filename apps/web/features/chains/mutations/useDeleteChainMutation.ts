import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getChainsQueryKey } from "../queries/keys";

/** Delete a chain definition (`DELETE /api/chains/:id`); runs/artifacts untouched. */
export const useDeleteChainMutation = makeInvalidatingMutation(
  apiClient.chains.deleteChain.useMutation,
  getChainsQueryKey,
);
