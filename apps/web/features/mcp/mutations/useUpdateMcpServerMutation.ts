import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getMcpServersQueryKey } from "../queries/useMcpServersQuery";

/** Update an MCP server (`PATCH /api/mcp-servers/:id`, never its type); refreshes the catalog. */
export const useUpdateMcpServerMutation = makeInvalidatingMutation(
  apiClient.mcpServers.updateMcpServer.useMutation,
  getMcpServersQueryKey,
);
