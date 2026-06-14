import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the command list. Exported so mutations can invalidate it. */
export function getCommandsQueryKey() {
  return ["commands"] as const;
}

/**
 * Live command catalog from `GET /api/commands` — the contract `Command` entity is
 * the single shape used end to end. Returns the TanStack query result directly;
 * `select` unwraps the response envelope so `data` is `Command[]`.
 */
export function useCommandsQuery() {
  return apiClient.commands.listCommands.useQuery({
    queryKey: getCommandsQueryKey(),
    select: selectApiResponseBody,
  });
}
