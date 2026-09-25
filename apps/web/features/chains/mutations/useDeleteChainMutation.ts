import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getChainsQueryKey } from "../queries/useChainsQuery";

/**
 * Remove a chain (`DELETE /api/handoff/chains/:id`) — 409s server-side while a
 * non-terminal parent task still references it (`ChainsService.delete`); the
 * detail screen surfaces that message inline rather than treating it as a
 * generic failure.
 */
export const useDeleteChainMutation = makeInvalidatingMutation(
  apiClient.handoff.deleteChain.useMutation,
  getChainsQueryKey,
);
