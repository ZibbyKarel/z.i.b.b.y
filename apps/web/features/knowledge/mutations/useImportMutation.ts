import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";

/**
 * Bulk-import `.md`/`.txt` files from a server-side folder into the halda queue
 * (`POST /api/memory/import`, phase 112). Invalidates the whole `["memory"]`
 * key on success — a "distill now" run's results (or the freshly staged, still
 * un-triaged files) show up after refetch, same as the other memory mutations.
 */
export function useImportMutation() {
  const qc = useQueryClient();
  return apiClient.memory.import.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memory"] }),
  });
}
