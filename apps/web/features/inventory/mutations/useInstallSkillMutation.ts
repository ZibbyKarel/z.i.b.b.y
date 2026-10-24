import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInventoryQueryKey } from "../queries/useInventoryQuery";

/**
 * Installs / updates a ZIBBY skill on the machine. A 404/409 is thrown by ts-rest,
 * so the row shows it inline (`meta.inlineError` keeps the global toast quiet).
 */
export function useInstallSkillMutation() {
  const queryClient = useQueryClient();
  return apiClient.inventory.installSkill.useMutation({
    meta: { inlineError: true },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: getInventoryQueryKey() });
    },
  });
}
