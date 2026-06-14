import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the MCP server list. Exported so mutations can invalidate it. */
export function getMcpServersQueryKey() {
  return ["mcp-servers"] as const;
}

/**
 * Live MCP server catalog from `GET /api/mcp-servers` — the contract `McpServer`
 * entity is the single shape used end to end. Returns the TanStack query result
 * directly; `select` unwraps the response envelope so `data` is `McpServer[]`.
 */
export function useMcpServersQuery() {
  return apiClient.mcpServers.listMcpServers.useQuery({
    queryKey: getMcpServersQueryKey(),
    select: selectApiResponseBody,
  });
}
