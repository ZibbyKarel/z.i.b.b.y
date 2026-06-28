import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getHooksQueryKey } from "../queries/useHooksQuery";

/** Delete a hook (`DELETE /api/hooks/:id`); refreshes the catalog on success. */
export const useDeleteHookMutation = makeInvalidatingMutation(
  apiClient.hooks.deleteHook.useMutation,
  getHooksQueryKey,
);
