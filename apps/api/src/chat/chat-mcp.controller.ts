import type { IncomingMessage, ServerResponse } from "node:http";
import { Controller, Get, Logger, Post, Req, Res } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { ChatToolResultRegistry } from "./chat-tool-result.registry";
import { ChatToolsService } from "./chat-tools.service";

/** Pull `conversationId` off the request URL's query string (see {@link mcpBaseUrl} in
 * `chat-session.service.ts`, which appends it when spawning the turn). Absent/malformed
 * falls back to `""` — the registry simply has nothing queued/held for that key, so a
 * turn without it degrades to the old un-enriched behaviour rather than throwing. */
function conversationIdFromUrl(url: string | undefined): string {
  try {
    return new URL(url ?? "", "http://localhost").searchParams.get("conversationId") ?? "";
  } catch {
    return "";
  }
}

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

  constructor(
    private readonly tools: ChatToolsService,
    private readonly toolResults: ChatToolResultRegistry,
  ) {}

  @Post("api/chat/mcp")
  async handle(@Req() req: IncomingMessage, @Res() res: ServerResponse): Promise<void> {
    const conversationId = conversationIdFromUrl(req.url);
    const server = this.buildServer(conversationId);
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

  /** Build a per-request MCP server with the chat tools registered, scoped to one conversation. */
  private buildServer(conversationId: string): McpServer {
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
      async ({ text: taskText, paths }) => {
        // Fáze 14.2: an @mention picked in the composer bypasses the classifier for
        // this conversation's in-flight turn — peek it (non-destructive; a turn may
        // dispatch more than once) and forward it as the scheduler's explicit target.
        const explicitTarget = this.toolResults.getExplicitTarget(conversationId);
        const result = await this.tools.createTask({ text: taskText, paths, explicitTarget });
        // Only the confirmation string goes to the model; the structured data (run/
        // target/task id) is queued for `chat-session.service#describeTool` to read
        // when it emits the inline `ChatToolEvent` — never round-tripped through the CLI.
        if (result.meta) this.toolResults.pushCreateTaskResult(conversationId, result.meta);
        return text(result.text);
      },
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

    server.registerTool(
      "machine_rename",
      {
        description:
          "PROPOSE renaming files in a folder on the operator's machine (find/replace a " +
          "substring in file names). This NEVER renames anything itself — it computes a " +
          "preview and parks a Tier-3 approval; only the operator's approve in the queue " +
          "executes it. Use when the operator asks to rename files in a named folder.",
        inputSchema: {
          folder: z.string().describe("Absolute path to the folder the operator named."),
          find: z.string().describe("Literal substring to find in file names."),
          replace: z.string().describe("Replacement (may be empty)."),
        },
      },
      async ({ folder, find, replace }) =>
        text(await this.tools.proposeRename({ folder, find, replace })),
    );

    server.registerTool(
      "open_maps",
      {
        description:
          "PROPOSE opening Apple Maps with a search (a place, an address, 'nearest X'). " +
          "Only opens a Maps window and is still approval-gated — nothing runs on the " +
          "operator's machine silently. Use when the operator asks to look something up in Maps.",
        inputSchema: {
          query: z.string().describe("The Maps search query in the operator's words."),
        },
      },
      async ({ query }) => text(await this.tools.proposeOpenMaps(query)),
    );

    server.registerTool(
      "open_folder",
      {
        description:
          "PROPOSE opening a folder on the operator's machine in their file manager " +
          "(a Finder/Explorer window on the named path). Only opens a window and is " +
          "still approval-gated — nothing runs on the operator's machine silently. " +
          "Use when the operator asks to open/show a named folder.",
        inputSchema: {
          path: z.string().describe("Absolute path to the folder the operator named."),
        },
      },
      async ({ path }) => text(await this.tools.proposeOpenFolder(path)),
    );

    return server;
  }
}
