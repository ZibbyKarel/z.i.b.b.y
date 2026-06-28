import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getMcpServersQueryKey } from "../queries/useMcpServersQuery";

/** Delete an MCP server (`DELETE /api/mcp-servers/:id`); cascades credentials server-side. */
export const useDeleteMcpServerMutation = makeInvalidatingMutation(
  apiClient.mcpServers.deleteMcpServer.useMutation,
  getMcpServersQueryKey,
);
