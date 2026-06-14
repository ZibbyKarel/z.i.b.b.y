import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getHooksQueryKey } from "../queries/useHooksQuery";

/** Delete a hook (`DELETE /api/hooks/:id`); refreshes the catalog on success. */
export function useDeleteHookMutation() {
  const qc = useQueryClient();
  return apiClient.hooks.deleteHook.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getHooksQueryKey() }),
  });
}
