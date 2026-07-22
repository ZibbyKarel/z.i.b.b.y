import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getSignalKindsQueryKey } from "../queries/useSignalKindsQuery";

/**
 * Remove an operator-authored signal kind (`DELETE /api/handoff-signal-kinds/:id`,
 * B3c design doc §"Slot B → B3"). A built-in kind (`system: true`) 403s server-side,
 * so callers must never offer this for one (see `SignalDetailScreen`'s
 * delete-affordance gating).
 */
export const useDeleteSignalKindMutation = makeInvalidatingMutation(
  apiClient.handoff.deleteSignalKind.useMutation,
  getSignalKindsQueryKey,
);
