import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getChainsQueryKey } from "../queries/useChainsQuery";

/**
 * Create-or-replace a chain (`PUT /api/handoff/chains/:id`) — atomically
 * rewrites its signal kind and exactly its own rules (`ChainsService.put`).
 * Used by both `/work/chains/new` (create) and `/work/chains/[id]`'s edit mode
 * (replace in place). Invalidates the whole `chains` key family — the list AND
 * any cached single-chain detail.
 */
export const usePutChainMutation = makeInvalidatingMutation(
  apiClient.handoff.putChain.useMutation,
  getChainsQueryKey,
);
