import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";

/**
 * Patch a note (`PATCH /api/memory/notes/:id`). Invalidates the whole `["memory"]`
 * key on success so the graph, the open note, and search all refresh.
 */
export function useUpdateNoteMutation() {
  const qc = useQueryClient();
  return apiClient.memory.updateNote.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memory"] }),
  });
}
