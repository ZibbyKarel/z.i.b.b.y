import type { IncomingMessage, ServerResponse } from "node:http";
import { Controller, Get, Logger, Post, Req, Res, UseGuards } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { envelopeInbound } from "../shared/text/untrusted-envelope";
import { KbMcpAuthGuard } from "./kb-mcp-auth.guard";
import type { KbRoot } from "./kb-scope.service";
import { KbScopeService } from "./kb-scope.service";
import { KbReaderService } from "./kb-reader.service";

/** Hard cap on merged search hits across every reachable root — a search never
 * floods the model with more than this many citations, however many teams/roots
 * the caller can reach. */
export const MAX_SEARCH_HITS = 8;

/** Wrap a tool's string result in the MCP text-content envelope. */
function text(value: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: value }] };
}

/** `X-Zibby-Run-Id` may arrive as a single header value or (per Node's `IncomingMessage`
 * typing) an array if the client sent it more than once — the first value wins. */
function runIdFromHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** One merged search hit, already attributed to the team it came from. */
interface AttributedHit {
  readonly team: string;
  readonly path: string;
  readonly title: string;
  readonly snippet: string;
}

/** Render one hit as a citation line: team id + repo-relative path + title, then the
 * (already enveloped) snippet — never anything derived from the root's absolute path. */
function formatHit(hit: AttributedHit): string {
  return `- [${hit.team}] ${hit.path} — ${hit.title}\n  ${hit.snippet}`;
}

/**
 * The `zibby-kb` MCP tools exposed to the `claude` CLI as an HTTP MCP server, hosted
 * INSIDE the api (no second process) — mirrors `ChatMcpController`'s shape
 * (`../chat/chat-mcp.controller.ts`). Read-only, two tools total:
 *
 * - `search_team_kb({ query, team? })` — searches every {@link KbRoot} the caller's
 *   scope reaches, merges hits, caps at {@link MAX_SEARCH_HITS}.
 * - `read_team_kb_note({ noteId, team? })` — reads one note from the first root
 *   (in scope order) that has it.
 *
 * Neither tool schema exposes a path/directory parameter — the model can never name
 * a filesystem location, only a free-text query, a note id, and an optional team id.
 * No write tool is registered; `KbReaderService` itself never writes either.
 *
 * `handle()` reads the caller's identity off `X-Zibby-Run-Id` when present (an agent
 * or pipeline run) and resolves scope via `KbScopeService.rootsForRun`; absent, it
 * falls back to the chat path (`rootsForChat`) — the operator is the principal, no
 * project in play. That header is **scoping input only, never authentication** — it
 * is low-entropy, guessable, and forgeable by any local process including the run
 * itself (see `KbScopeService`'s class doc). {@link KbMcpAuthGuard} — a per-boot
 * bearer token + loopback check — is the ONLY authentication boundary for this route.
 *
 * An empty scope (unknown team, no permission, no KB configured) always returns an
 * explicit empty-result message, never an error and never a message naming the
 * cause — a caller can never tell "team doesn't exist" apart from "team exists but
 * you can't reach it", both land on the same empty-scope branch. `search_team_kb`'s
 * empty-scope message differs from its zero-hits message ("no knowledge base is
 * reachable" vs. "no results for <query>") — that's a hint to the model about where
 * to widen its query, not a security-relevant distinction: both are equally reachable
 * to an unauthorized caller, since an unknown/unreachable team never gets past the
 * empty-scope branch to begin with.
 */
@Controller()
export class KbMcpController {
  private readonly logger = new Logger(KbMcpController.name);

  constructor(
    private readonly scope: KbScopeService,
    private readonly reader: KbReaderService,
  ) {}

  @Post("api/kb/mcp")
  @UseGuards(KbMcpAuthGuard)
  async handle(@Req() req: IncomingMessage, @Res() res: ServerResponse): Promise<void> {
    const runId = runIdFromHeader(req.headers["x-zibby-run-id"]);
    const server = this.buildServer(runId);
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
      this.logger.error(`kb mcp request failed: ${String(error)}`);
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

  @Get("api/kb/mcp")
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

  /** Resolve the caller's reachable KB roots — by run id when present, else chat. */
  private rootsFor(runId: string | undefined, team: string | undefined): Promise<KbRoot[]> {
    return runId ? this.scope.rootsForRun(runId, team) : this.scope.rootsForChat(team);
  }

  /** Build a per-request MCP server with the KB tools registered, scoped to one caller. */
  private buildServer(runId: string | undefined): McpServer {
    const server = new McpServer({ name: "zibby-kb", version: "1.0.0" });

    server.registerTool(
      "search_team_kb",
      {
        description:
          "Search the operator's team knowledge base(s) for notes matching a query. " +
          "Read-only. Returns at most a handful of the best-matching hits, each cited " +
          "by team + note path + title, with a short snippet.",
        inputSchema: {
          query: z.string().describe("What to search for, in your own words."),
          team: z
            .string()
            .optional()
            .describe(
              "Optional team ID (not its display name) to narrow the search to one " +
                "team's knowledge base. Omit to search every team knowledge base you can reach.",
            ),
        },
      },
      async ({ query, team }) => {
        const roots = await this.rootsFor(runId, team);
        if (roots.length === 0) {
          return text("No team knowledge base is reachable here.");
        }
        const merged: AttributedHit[] = [];
        for (const root of roots) {
          const hits = await this.reader.search(root.source, query);
          for (const hit of hits) {
            merged.push({
              team: root.teamId,
              path: hit.path,
              title: hit.title,
              snippet: envelopeInbound(hit.snippet),
            });
          }
        }
        const capped = merged.slice(0, MAX_SEARCH_HITS);
        if (capped.length === 0) {
          return text(`No knowledge-base results for "${query}".`);
        }
        return text(capped.map(formatHit).join("\n\n"));
      },
    );

    server.registerTool(
      "read_team_kb_note",
      {
        description:
          "Read one full note from the operator's team knowledge base by its note id " +
          "(from a prior search_team_kb hit). Read-only.",
        inputSchema: {
          noteId: z.string().describe("The note's id, as returned by search_team_kb."),
          team: z
            .string()
            .optional()
            .describe(
              "Optional team ID (not its display name) to narrow which team's " +
                "knowledge base to read the note from. Omit to search every team " +
                "knowledge base you can reach.",
            ),
        },
      },
      async ({ noteId, team }) => {
        const roots = await this.rootsFor(runId, team);
        for (const root of roots) {
          const note = await this.reader.read(root.source, noteId);
          if (note) {
            return text(
              `[${root.teamId}] ${note.path} — ${note.title}\n\n${envelopeInbound(note.body)}`,
            );
          }
        }
        return text(`No note "${noteId}" found in any reachable knowledge base.`);
      },
    );

    return server;
  }
}
