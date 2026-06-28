import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getMcpServersQueryKey } from "../queries/useMcpServersQuery";

/**
 * Set an MCP server's secret (`PUT /api/mcp-servers/:id/credentials`). Write-only
 * — the secret is never read back; the catalog is refreshed so `hasCredentials`
 * flips to true.
 */
export const useSetMcpCredentialsMutation = makeInvalidatingMutation(
  apiClient.mcpServers.setMcpCredentials.useMutation,
  getMcpServersQueryKey,
);
