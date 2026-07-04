import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getPinsQueryKey } from "../queries/usePinsQuery";

/** Replace the pinned targets (`PUT /api/pins`); refreshes them on success. */
export const useSetPinsMutation = makeInvalidatingMutation(
  apiClient.pins.putPins.useMutation,
  getPinsQueryKey,
);
