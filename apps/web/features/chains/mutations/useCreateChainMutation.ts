import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getChainsQueryKey } from "../queries/keys";

/** Create a chain (`POST /api/chains`); refreshes the list on success. */
export const useCreateChainMutation = makeInvalidatingMutation(
  apiClient.chains.createChain.useMutation,
  getChainsQueryKey,
);
