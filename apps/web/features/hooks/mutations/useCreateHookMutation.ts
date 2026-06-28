import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getHooksQueryKey } from "../queries/useHooksQuery";

/** Create a hook (`POST /api/hooks`); refreshes the catalog on success. */
export const useCreateHookMutation = makeInvalidatingMutation(
  apiClient.hooks.createHook.useMutation,
  getHooksQueryKey,
);
