import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getMcpServersQueryKey } from "../queries/useMcpServersQuery";

/** Create an MCP server (`POST /api/mcp-servers`); refreshes the catalog on success. */
export function useCreateMcpServerMutation() {
  const qc = useQueryClient();
  return apiClient.mcpServers.createMcpServer.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getMcpServersQueryKey() }),
  });
}
