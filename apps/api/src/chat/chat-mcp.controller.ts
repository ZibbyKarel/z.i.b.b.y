import type { IncomingMessage, ServerResponse } from "node:http";
import { Controller, Get, Logger, Post, Req, Res } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { ChatToolsService } from "./chat-tools.service";

/** Wrap a tool's string result in the MCP text-content envelope. */
function text(value: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: value }] };
}

/**
 * The chat tools exposed to the `claude` CLI as an HTTP MCP server, hosted INSIDE the
 * api (no second process): the streaming chat turn spawns with
 * `--mcp-config {zibby:{type:"http",url:.../api/chat/mcp}} --allowedTools mcp__zibby__*`
 * and the model calls these to act — dispatch a task, recall memory, report status.
 *
 * Stateless transport (`sessionIdGenerator: undefined`, `enableJsonResponse: true`):
 * one fresh {@link McpServer} + {@link StreamableHTTPServerTransport} per POST, closed
 * when the response ends — no session table, safe under concurrent turns. GET is a 405
 * (no server-initiated streaming needed; tools are request/response).
 *
 * The route carries the `api/` prefix explicitly (this app sets no global prefix — the
 * SSE route is likewise `@Sse("api/chat/stream")`); the toolArgs URL must match it.
 */
@Controller()
export class ChatMcpController {
  private readonly logger = new Logger(ChatMcpController.name);

  constructor(private readonly tools: ChatToolsService) {}

  @Post("api/chat/mcp")
  async handle(@Req() req: IncomingMessage, @Res() res: ServerResponse): Promise<void> {
    const server = this.buildServer();
    // Stateless: no session id, single JSON response per request (simplest round-trip).
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      // NestJS's body parser already drained the stream — pass the parsed body or the
      // transport reads an empty stream and hangs (the #1 NestJS-MCP failure mode).
      await transport.handleRequest(req, res, (req as { body?: unknown }).body);
    } catch (error) {
      this.logger.error(`chat mcp request failed: ${String(error)}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }),
        );
      }
    }
  }

  @Get("api/chat/mcp")
  rejectGet(@Res() res: ServerResponse): void {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      }),
    );
  }

  /** Build a per-request MCP server with the three chat tools registered. */
  private buildServer(): McpServer {
    const server = new McpServer({ name: "zibby", version: "1.0.0" });

    server.registerTool(
      "create_task",
      {
        description:
          "Dispatch a NEW work task the operator explicitly requested (build, fix, run, " +
          "investigate something concrete). This STARTS a run and routes through the " +
          "approval gate. Do NOT call this for casual conversation, greetings, or " +
          "questions about status — only when the operator asks for actual work to be done.",
        inputSchema: {
          text: z.string().describe("The task in the operator's words."),
          paths: z
            .array(z.string())
            .optional()
            .describe("Optional file/folder paths the task concerns."),
        },
      },
      async ({ text: taskText, paths }) => text(await this.tools.createTask({ text: taskText, paths })),
    );

    server.registerTool(
      "recall_memory",
      {
        description:
          "Search ZIBBY's second-brain memory (the Obsidian vault) and return the top " +
          "matching notes. Use when the operator asks what you remember / know about something.",
        inputSchema: {
          query: z.string().describe("What to look up in memory."),
        },
      },
      async ({ query }) => text(await this.tools.recallMemory(query)),
    );

    server.registerTool(
      "get_status",
      {
        description:
          "Report what's happening right now: pending decisions that need the operator " +
          "and what ZIBBY is watching. Read-only. Use when the operator asks how things " +
          "are going / what's up.",
        inputSchema: {},
      },
      async () => text(await this.tools.getStatus()),
    );

    return server;
  }
}
