import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getMcpServersQueryKey } from "../queries/useMcpServersQuery";

/** Update an MCP server (`PATCH /api/mcp-servers/:id`, never its type); refreshes the catalog. */
export function useUpdateMcpServerMutation() {
  const qc = useQueryClient();
  return apiClient.mcpServers.updateMcpServer.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getMcpServersQueryKey() }),
  });
}
