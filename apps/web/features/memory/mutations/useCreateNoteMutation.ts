import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";

/**
 * Create a note (`POST /api/memory/notes`). Invalidates the whole `["memory"]`
 * key on success — one move refreshes the graph, any open note, and search.
 */
export function useCreateNoteMutation() {
  const qc = useQueryClient();
  return apiClient.memory.createNote.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memory"] }),
  });
}
