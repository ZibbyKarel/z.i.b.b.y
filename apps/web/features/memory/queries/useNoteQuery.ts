import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getNoteQueryKey(id: string) {
  return ["memory", "note", id] as const;
}

/** A single note (`GET /api/memory/note/:id`), enabled only when an id is selected. */
export function useNoteQuery(id: string | null) {
  return apiClient.memory.getNote.useQuery({
    queryKey: getNoteQueryKey(id ?? "none"),
    queryData: { params: { id: id ?? "" } },
    enabled: id !== null,
    select: selectApiResponseBody,
  });
}
