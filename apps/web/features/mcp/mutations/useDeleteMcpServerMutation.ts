import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getMcpServersQueryKey } from "../queries/useMcpServersQuery";

/** Delete an MCP server (`DELETE /api/mcp-servers/:id`); cascades credentials server-side. */
export function useDeleteMcpServerMutation() {
  const qc = useQueryClient();
  return apiClient.mcpServers.deleteMcpServer.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getMcpServersQueryKey() }),
  });
}
