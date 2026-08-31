import type { ServerResponse } from "node:http";
import { Controller, Get, Logger, Post, Req, Res, UseGuards } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { envelopeInbound } from "../shared/text/untrusted-envelope";
import type { KbAuthedRequest, KbCaller } from "./kb-mcp-auth.guard";
import { KbMcpAuthGuard } from "./kb-mcp-auth.guard";
import type { KbRoot } from "./kb-scope.service";
import { KbScopeService } from "./kb-scope.service";
import { KbReaderService } from "./kb-reader.service";

/** Hard cap on merged search hits across every reachable root — a search never
 * floods the model with more than this many citations, however many teams/roots
 * the caller can reach. Also the per-root `limit` passed to
 * `KbReaderService.search` (fix round 1, F5) — no single root ever needs to
 * return more hits than the total cap could ever use. */
export const MAX_SEARCH_HITS = 8;

/** Hard cap on a note's title before it enters the untrusted envelope (fix
 * round 1, F2) — KB-authored YAML frontmatter can set `title` to an
 * arbitrary-length block scalar. Capping it here, separately from
 * `envelopeInbound`'s own shared length budget, stops one oversized title
 * from crowding out the actual snippet/body within that shared budget. */
export const MAX_KB_TITLE_CHARS = 120;

/** Wrap a tool's string result in the MCP text-content envelope. */
function text(value: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: value }] };
}

/** `X-Zibby-Run-Id` may arrive as a single header value or (per Node's `IncomingMessage`
 * typing) an array if the client sent it more than once — the first value wins. */
function runIdFromHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Pull `teamId` off the request URL's query string — Task 8, mirrors
 * `conversationIdFromUrl` in `../chat/chat-mcp.controller.ts` exactly.
 * `undefined` (never `""`) when the operator tagged no team, so
 * `KbScopeService.rootsForChat(undefined)` still resolves to EVERY team's KB
 * as designed — this is the CEILING `rootsFor` applies on the chat path. */
function teamIdFromUrl(url: string | undefined): string | undefined {
  return new URL(url ?? "", "http://localhost").searchParams.get("teamId") ?? undefined;
}

/** Truncate a title to {@link MAX_KB_TITLE_CHARS} BEFORE it goes anywhere near
 * `envelopeInbound` — that function's own length cap bounds the COMBINED
 * path+title+snippet/body string, so an uncapped title alone could consume
 * the whole shared budget and crowd out the actual content. */
function capTitle(title: string): string {
  return title.length > MAX_KB_TITLE_CHARS ? `${title.slice(0, MAX_KB_TITLE_CHARS - 1)}…` : title;
}

/** One merged search hit, already attributed to the team it came from. `path`,
 * `title`, and `snippet` are all KB-author-controlled and untrusted; only
 * `team` (the team registry id) is trusted. */
interface AttributedHit {
  readonly team: string;
  readonly path: string;
  readonly title: string;
  readonly snippet: string;
}

/** Render one hit as a citation: the trusted `[team]` prefix, then
 * path + title + snippet — ALL untrusted, ALL inside ONE `envelopeInbound`
 * call (fix round 1, F2 — `path`/`title` used to sit outside the envelope,
 * bypassing both `sanitizeInbound`'s control-char/fence defang and its
 * length cap; a block-scalar frontmatter title could defeat the snippet's
 * own budget entirely). */
function formatHit(hit: AttributedHit): string {
  const untrusted = `${hit.path} — ${capTitle(hit.title)}\n${hit.snippet}`;
  return `- [${hit.team}]\n${envelopeInbound(untrusted)}`;
}

/** Round-robin interleave across per-root hit lists (root A's 1st, root B's
 * 1st, root A's 2nd, root B's 2nd, …) so that capping at
 * {@link MAX_SEARCH_HITS} afterward can never let one root, by sorting
 * earlier in scope order, consume the entire cap (fix round 1, F5 — a plain
 * concatenate-then-slice let the first team in list order push every other
 * team's hits out of the result). This is fair-by-team ordering, NOT
 * global-best-first — `KbHit` carries no relevance score to merge-sort on
 * (a reviewed Task 6 interface); round-robin is the minimal fix that removes
 * the root-order bias without redesigning that interface. */
function interleaveRoundRobin<T>(lists: readonly T[][]): T[] {
  const out: T[] = [];
  const maxLen = lists.reduce((longest, list) => Math.max(longest, list.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      const item = list[i];
      if (item !== undefined) out.push(item);
    }
  }
  return out;
}

/**
 * The `zibby-kb` MCP tools exposed to the `claude` CLI as an HTTP MCP server, hosted
 * INSIDE the api (no second process) — mirrors `ChatMcpController`'s shape
 * (`../chat/chat-mcp.controller.ts`). Read-only, two tools total:
 *
 * - `search_team_kb({ query, team? })` — searches every {@link KbRoot} the caller's
 *   scope reaches, merges hits round-robin across roots, caps at {@link MAX_SEARCH_HITS}.
 * - `read_team_kb_note({ noteId, team? })` — reads one note from the first root
 *   (in scope order) that has it.
 *
 * Neither tool schema exposes a path/directory parameter — the model can never name
 * a filesystem location, only a free-text query, a note id, and an optional team id.
 * No write tool is registered; `KbReaderService` itself never writes either.
 *
 * **The caller path is decided by the TOKEN that authenticated the request —
 * `req.kbCaller`, set by {@link KbMcpAuthGuard} — NEVER by whether
 * `X-Zibby-Run-Id` is present.** (Fix round 1, finding F3: the previous
 * `runId present ? rootsForRun : rootsForChat` branch was fail-OPEN.
 * `KbScopeService.rootsForChat(undefined)` deliberately returns EVERY team's
 * KB — so a live agent run, holding only the run token, could read its own
 * seeded row's credential out of its own sandbox, drop the `X-Zibby-Run-Id`
 * header, and reach every team's knowledge base with no forgery at all.) The
 * four-row rule this replaces it with:
 *
 * | `kbCaller` | `X-Zibby-Run-Id` | result |
 * | --- | --- | --- |
 * | `"run"`  | present | `rootsForRun(headerRunId, team?)` |
 * | `"run"`  | absent  | `rootsForRun(undefined, …)` → `[]` — fails closed |
 * | `"chat"` | absent  | `rootsForChat(team?)` |
 * | `"chat"` | present | **chat path; the header is ignored entirely** |
 *
 * That last row is deliberate: routing it to `rootsForRun` would only
 * narrow, but ambiguity in an auth boundary is worse than a stated rule.
 * Whatever `X-Zibby-Run-Id` claims, a request authenticated with the CHAT
 * token always gets the chat path — the header carries no authority here,
 * only the token that authenticated the request does.
 *
 * BE ACCURATE ABOUT WHAT THIS BUYS: this is **leash integrity** — the
 * model's sanctioned surface now fails closed by default — NOT a hard
 * boundary against an arbitrary local process. Either per-boot token sits in
 * a 0600 file readable by any same-uid process, exactly as a single token
 * would. See `KbMcpAuthService`'s class doc for the full rationale.
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
  async handle(@Req() req: KbAuthedRequest, @Res() res: ServerResponse): Promise<void> {
    // `KbMcpAuthGuard` always sets `kbCaller` before this handler runs — a route
    // guarded by it can't be reached without it. The `"run"` fallback below is
    // defense in depth ONLY, and — critically — fails CLOSED ("run" + no
    // header → `[]`, never every team's KB) if it somehow weren't set.
    const caller: KbCaller = req.kbCaller ?? "run";
    const runId = runIdFromHeader(req.headers["x-zibby-run-id"]);
    // Task 8: the operator's explicit `@`-mention team tag, if any — the CEILING
    // a tool call's own `team` argument narrows within on the chat path (see
    // `rootsFor`'s doc). Read regardless of caller; only ever consulted there.
    const queryTeamId = teamIdFromUrl(req.url);
    const server = this.buildServer(caller, runId, queryTeamId);
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

  /**
   * Resolve the caller's reachable KB roots. `caller` — derived from WHICH
   * token authenticated the request, never from header presence — decides
   * the path; see the class doc's four-row table. `runId` is read from the
   * header regardless, but only ever consulted on the `"run"` path — untouched
   * by Task 8.
   *
   * Task 8 — the chat path narrows in TWO stages, and BOTH only ever narrow,
   * never widen:
   *
   *  1. `queryTeamId` (the `?teamId=` query param — the operator's explicit
   *     `@`-mention tag for this turn) is the CEILING: `rootsForChat(queryTeamId)`
   *     resolves exactly what the operator tagged, or every team's KB when the
   *     turn carried no tag.
   *  2. `toolTeam` (the tool call's own `team` argument — the MODEL's request,
   *     inside one turn) then filters that ceiling client-side. It can never
   *     reach a team outside the ceiling: a model asking for a team the operator
   *     did not tag gets `[]`, not that team's KB and not an error.
   *
   * The run path is UNCHANGED: `toolTeam` still passes straight through to
   * `rootsForRun`, which enforces its own single-project ceiling independently.
   */
  private async rootsFor(
    caller: KbCaller,
    runId: string | undefined,
    queryTeamId: string | undefined,
    toolTeam: string | undefined,
  ): Promise<KbRoot[]> {
    if (caller === "run") return this.scope.rootsForRun(runId, toolTeam);
    const roots = await this.scope.rootsForChat(queryTeamId);
    return toolTeam ? roots.filter((root) => root.teamId === toolTeam) : roots;
  }

  /** Build a per-request MCP server with the KB tools registered, scoped to one
   * caller and (Task 8) the operator's query-param team ceiling. */
  private buildServer(
    caller: KbCaller,
    runId: string | undefined,
    queryTeamId: string | undefined,
  ): McpServer {
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
        const roots = await this.rootsFor(caller, runId, queryTeamId, team);
        if (roots.length === 0) {
          return text("No team knowledge base is reachable here.");
        }
        const perRoot: AttributedHit[][] = [];
        for (const root of roots) {
          const hits = await this.reader.search(root.source, query, MAX_SEARCH_HITS);
          perRoot.push(
            hits.map((hit) => ({
              team: root.teamId,
              path: hit.path,
              title: hit.title,
              snippet: hit.snippet,
            })),
          );
        }
        const capped = interleaveRoundRobin(perRoot).slice(0, MAX_SEARCH_HITS);
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
        const roots = await this.rootsFor(caller, runId, queryTeamId, team);
        for (const root of roots) {
          const note = await this.reader.read(root.source, noteId);
          if (note) {
            // Both path and title, untrusted, go INSIDE the same envelope as
            // the body (fix round 1, F2) — only the team id, outside, is trusted.
            const untrusted = `${note.path} — ${capTitle(note.title)}\n\n${note.body}`;
            return text(`[${root.teamId}]\n${envelopeInbound(untrusted)}`);
          }
        }
        return text(`No note "${noteId}" found in any reachable knowledge base.`);
      },
    );

    return server;
  }
}
