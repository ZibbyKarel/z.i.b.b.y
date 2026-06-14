import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getHooksQueryKey } from "../queries/useHooksQuery";

/** Update a hook (`PATCH /api/hooks/:id`); refreshes the catalog on success. */
export function useUpdateHookMutation() {
  const qc = useQueryClient();
  return apiClient.hooks.updateHook.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getHooksQueryKey() }),
  });
}
