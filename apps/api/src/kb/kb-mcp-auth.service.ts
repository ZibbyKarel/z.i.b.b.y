import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

/**
 * TWO per-boot shared secrets for the `zibby-kb` MCP endpoint (`POST
 * /api/kb/mcp`) — a **run token** and a **chat token** — each minted once at
 * construction (`randomBytes(32).toString("hex")`), kept in memory only: no
 * env var, no persistence, no rotation. Mirrors `ChatMcpAuthService`'s
 * posture (`../chat/chat-mcp-auth.service.ts`) exactly, doubled.
 *
 * WHY TWO (fix round 1, finding F3 — the caller path was fail-OPEN):
 * `KbMcpController` used to decide its roots-resolution path on
 * `X-Zibby-Run-Id present ? rootsForRun : rootsForChat`. That header is
 * scoping input any same-uid process can omit at will — so a live agent run
 * could read its own seeded row's token out of its own 0600 MCP config, drop
 * the header, and reach `rootsForChat(undefined)`: every team's KB, with no
 * forgery needed at all.
 *
 * The fix makes the CREDENTIAL — not the header — the thing that decides the
 * path. `KbMcpAuthGuard` accepts EITHER token and records which one matched
 * as `req.kbCaller`; `KbMcpController` branches on THAT, never on header
 * presence:
 *
 * - The run token can only ever resolve via `KbScopeService.rootsForRun`,
 *   which fails CLOSED to `[]` without a real, currently-live run id.
 * - The chat token always resolves via `KbScopeService.rootsForChat`, full
 *   stop — with or without an `X-Zibby-Run-Id` header.
 *
 * See `KbMcpAuthGuard` for the constant-time matching (both tokens compared
 * with the SAME length-check-then-`timingSafeEqual` discipline as a single
 * token would be — having two doesn't weaken either comparison) and
 * `KbMcpController`'s class doc for the full four-row truth table this buys.
 *
 * BE ACCURATE ABOUT WHAT THIS BUYS: this is **leash integrity** for the
 * model's sanctioned surface — it now fails closed by default — NOT a hard
 * boundary against an arbitrary local process. Either token still sits in a
 * 0600 file readable by any same-uid process, exactly as one token would.
 * Do not build this out into a credential framework; it is two minted
 * strings and a branch.
 *
 * SINGLE source of truth: `KbModule` provides AND *exports* this so
 * `McpServersStorageService` (`../mcp/mcp.storage.service.ts`, a different
 * Nest module) can inject it to write the RUN token — never the chat token —
 * into the seeded `zibby-kb` row's credentials. The chat token is not
 * written anywhere and is not reachable through `GET /api/mcp-servers`.
 */
@Injectable()
export class KbMcpAuthService {
  private readonly runToken = randomBytes(32).toString("hex");
  private readonly chatToken = randomBytes(32).toString("hex");

  /** This boot's bearer token for an agent/pipeline run's `--mcp-config`
   * header — the ONLY token that can ever resolve via `rootsForRun`. */
  get runBearerToken(): string {
    return this.runToken;
  }

  /** This boot's bearer token for the operator-as-principal (chat) path —
   * always resolves via `rootsForChat`, `X-Zibby-Run-Id` or not. */
  get chatBearerToken(): string {
    return this.chatToken;
  }
}
