import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getHooksQueryKey } from "../queries/useHooksQuery";

/** Update a hook (`PATCH /api/hooks/:id`); refreshes the catalog on success. */
export const useUpdateHookMutation = makeInvalidatingMutation(
  apiClient.hooks.updateHook.useMutation,
  getHooksQueryKey,
);
