import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Cache key for one MCP server's detail. Prefix-nested under the
 * `["mcp-servers"]` list family, so the mutations' existing list invalidation
 * refreshes the detail too.
 */
export function getMcpServerQueryKey(id: string) {
  return ["mcp-servers", "detail", id] as const;
}

/** One MCP server from `GET /api/mcp-servers/:id` — backs the `/mcp/:id` detail page. */
export function useMcpServerQuery(id: string) {
  return apiClient.mcpServers.getMcpServer.useQuery({
    queryKey: getMcpServerQueryKey(id),
    queryData: { params: { id } },
    retry: false,
    select: selectApiResponseBody,
  });
}
