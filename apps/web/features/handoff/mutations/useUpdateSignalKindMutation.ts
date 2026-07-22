import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getSignalKindsQueryKey } from "../queries/useSignalKindsQuery";

/**
 * Edit an operator-authored signal kind in place (`PATCH /api/handoff-signal-kinds/:id`,
 * B3c design doc §"Slot B → B3"). A built-in kind (`system: true`) 403s server-side, so
 * callers must never offer this for one (see `SignalDetailScreen`'s edit-affordance gating).
 */
export const useUpdateSignalKindMutation = makeInvalidatingMutation(
  apiClient.handoff.updateSignalKind.useMutation,
  getSignalKindsQueryKey,
);
