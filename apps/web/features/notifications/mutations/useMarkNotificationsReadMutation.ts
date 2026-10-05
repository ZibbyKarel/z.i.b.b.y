import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getDepartmentsQueryKey } from "../../departments/queries/useDepartmentsQuery";
import { getNotificationsQueryKey } from "../queries/useNotificationsQuery";

/**
 * Mark failed runs read (`POST /api/notifications/read`; no `runIds` = all). Also
 * refreshes departments — their `errorCount` (and so Zibby's error) reads the same state.
 */
export function useMarkNotificationsReadMutation() {
  const queryClient = useQueryClient();
  return apiClient.notifications.markNotificationsRead.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getNotificationsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getDepartmentsQueryKey() });
    },
  });
}
