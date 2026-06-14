import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getMcpServersQueryKey } from "../queries/useMcpServersQuery";

/**
 * Set an MCP server's secret (`PUT /api/mcp-servers/:id/credentials`). Write-only
 * — the secret is never read back; the catalog is refreshed so `hasCredentials`
 * flips to true.
 */
export function useSetMcpCredentialsMutation() {
  const qc = useQueryClient();
  return apiClient.mcpServers.setMcpCredentials.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getMcpServersQueryKey() }),
  });
}
