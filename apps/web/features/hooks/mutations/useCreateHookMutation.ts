import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getHooksQueryKey } from "../queries/useHooksQuery";

/** Create a hook (`POST /api/hooks`); refreshes the catalog on success. */
export function useCreateHookMutation() {
  const qc = useQueryClient();
  return apiClient.hooks.createHook.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getHooksQueryKey() }),
  });
}
