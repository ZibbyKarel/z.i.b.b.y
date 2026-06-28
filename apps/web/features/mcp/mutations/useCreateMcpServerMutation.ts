import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getMcpServersQueryKey } from "../queries/useMcpServersQuery";

/** Create an MCP server (`POST /api/mcp-servers`); refreshes the catalog on success. */
export const useCreateMcpServerMutation = makeInvalidatingMutation(
  apiClient.mcpServers.createMcpServer.useMutation,
  getMcpServersQueryKey,
);
