import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

const BEARER_PREFIX = "Bearer ";

/** Addresses Node considers "this machine" for a TCP peer. IPv4-mapped IPv6
 * (`::ffff:127.0.0.1`) shows up when the server also accepts IPv6 connections. */
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Per-boot shared secret for the `zibby-kb` MCP endpoint (`POST /api/kb/mcp`), minted
 * ONCE per process — `randomBytes(32).toString("hex")` — kept in memory only: no env
 * var, no persistence, no rotation. Mirrors `ChatMcpAuthService`'s posture exactly,
 * but exported as a plain module-level constant rather than its own injectable
 * service: the only OTHER consumer is `McpServersStorageService`
 * (`../mcp/mcp.storage.service.ts`), which lives in a different Nest module.
 * `McpServersStorageService` writes this same value into the seeded `zibby-kb` row's
 * MCP credentials (`authToken`) on every boot, so `ClaudeRunCommandService`'s
 * (unmodified) `buildMcpConfig` folds it into the `Authorization: Bearer` header of
 * every run's `--mcp-config`, exactly like it does for any other server's stored
 * credential — a plain import keeps this a single source of truth without a
 * cross-module DI wire-up (which would otherwise need `McpModule` to import
 * `KbModule`, and `KbModule` already imports `AgentsModule`/`PipelinesModule`, which
 * `McpModule`-adjacent runner code depends on — see `ClaudeRunCommandService`).
 */
export const KB_MCP_BEARER_TOKEN = randomBytes(32).toString("hex");

/**
 * Locks down `POST /api/kb/mcp` — the in-process MCP endpoint exposing the
 * `zibby-kb` server (team-knowledge-base search/read). Mirrors
 * `ChatMcpAuthGuard` (`../chat/chat-mcp-auth.guard.ts`) exactly: enforces BOTH
 * checks, independently — a correct token from a non-loopback peer still
 * fails, and a loopback peer with no/wrong token still fails.
 *
 *  1. `Authorization: Bearer <token>` compared against {@link KB_MCP_BEARER_TOKEN}
 *     via `crypto.timingSafeEqual` (constant-time). The length-mismatch case is
 *     handled FIRST — `timingSafeEqual` THROWS on unequal buffer lengths, so a
 *     wrong-length token 401s instead of crashing the request.
 *  2. `req.socket.remoteAddress` is loopback.
 *
 * This guard is the **sole authentication boundary** for the `zibby-kb` endpoint.
 * `X-Zibby-Run-Id` (read by the controller, resolved by `KbScopeService`) is
 * scoping input only — low-entropy, guessable, forgeable by any local process
 * including the run itself — and plays NO part in authentication here.
 */
@Injectable()
export class KbMcpAuthGuard implements CanActivate {
  private readonly token = KB_MCP_BEARER_TOKEN;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<IncomingMessage>();

    const header = req.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException("Missing or malformed Authorization header.");
    }

    const provided = Buffer.from(header.slice(BEARER_PREFIX.length), "utf8");
    const expected = Buffer.from(this.token, "utf8");
    // timingSafeEqual throws on unequal-length buffers — check length first so a
    // wrong-length token 401s like any other mismatch instead of throwing a 500.
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException("Invalid token.");
    }

    const remoteAddress = req.socket.remoteAddress;
    if (!remoteAddress || !LOOPBACK_ADDRESSES.has(remoteAddress)) {
      throw new UnauthorizedException("Not a loopback peer.");
    }

    return true;
  }
}
