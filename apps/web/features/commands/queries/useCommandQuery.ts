import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getCommandQueryKey(id: string) {
  return ["commands", id] as const;
}

/**
 * A single command with its full body (`GET /api/commands/:id`) — the list query
 * carries `instructions` too, but the edit modal fetches the whole command here so
 * it always edits the latest server state. Enabled only when a command is selected.
 */
export function useCommandQuery(id: string | null) {
  return apiClient.commands.getCommand.useQuery({
    queryKey: getCommandQueryKey(id ?? "none"),
    queryData: { params: { id: id ?? "" } },
    enabled: id !== null,
    select: selectApiResponseBody,
  });
}
