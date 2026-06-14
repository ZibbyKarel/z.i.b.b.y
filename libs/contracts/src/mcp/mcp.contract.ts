import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "../common.schema"
import {
  CreateMcpServerSchema,
  McpCredentialsInputSchema,
  McpServerIdSchema,
  McpServerSchema,
  UpdateMcpServerSchema,
} from "./mcp.schema"

const c = initContract()

const IdParam = z.object({ id: McpServerIdSchema })

/**
 * Connected MCP servers. CRUD plus a write-only credentials sub-resource, mirroring
 * `integrationsContract`. Credentials are never readable over HTTP — the entity
 * exposes only `hasCredentials` — and `type` is immutable (an update may not change
 * the transport; rejected with 422). The runner injects enabled servers into every
 * run via `--mcp-config` and widens `--allowedTools` with `mcp__<id>__*`.
 */
export const mcpContract = c.router(
  {
    createMcpServer: {
      method: "POST",
      path: "/mcp-servers",
      body: CreateMcpServerSchema,
      responses: { 201: McpServerSchema, 409: ErrorSchema, 422: ErrorSchema },
      summary: "Create an MCP server",
    },
    listMcpServers: {
      method: "GET",
      path: "/mcp-servers",
      responses: { 200: z.array(McpServerSchema) },
      summary: "List MCP servers",
    },
    getMcpServer: {
      method: "GET",
      path: "/mcp-servers/:id",
      pathParams: IdParam,
      responses: { 200: McpServerSchema, 404: ErrorSchema },
      summary: "Get an MCP server by id",
    },
    updateMcpServer: {
      method: "PATCH",
      path: "/mcp-servers/:id",
      pathParams: IdParam,
      body: UpdateMcpServerSchema,
      responses: { 200: McpServerSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Update an MCP server (never its type)",
    },
    deleteMcpServer: {
      method: "DELETE",
      path: "/mcp-servers/:id",
      pathParams: IdParam,
      responses: { 200: z.object({ id: McpServerIdSchema }), 404: ErrorSchema },
      summary: "Delete an MCP server (cascades its credentials)",
    },
    setMcpCredentials: {
      method: "PUT",
      path: "/mcp-servers/:id/credentials",
      pathParams: IdParam,
      body: McpCredentialsInputSchema,
      responses: { 200: McpServerSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Set an MCP server's secret (write-only; never read back)",
    },
    deleteMcpCredentials: {
      method: "DELETE",
      path: "/mcp-servers/:id/credentials",
      pathParams: IdParam,
      responses: { 200: McpServerSchema, 404: ErrorSchema },
      summary: "Remove an MCP server's stored secret",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type McpContract = typeof mcpContract
