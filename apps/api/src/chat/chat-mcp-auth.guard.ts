import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ChatMcpAuthService } from "./chat-mcp-auth.service";

const BEARER_PREFIX = "Bearer ";

/** Addresses Node considers "this machine" for a TCP peer. IPv4-mapped IPv6
 * (`::ffff:127.0.0.1`) shows up when the server also accepts IPv6 connections. */
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * FIRST NestJS Guard in this codebase (verified: `grep -rn "implements CanActivate"
 * apps/api/src` was empty before this). Locks down `POST /api/chat/mcp` — the
 * in-process MCP endpoint the spawned `claude` CLI calls back into for 6 privileged
 * tools (`create_task`, `recall_memory`, `get_status`, `machine_rename`,
 * `open_maps`, `open_folder`) — which otherwise has zero auth on an all-interfaces
 * bind (`main.ts`'s bare `app.listen(port)`; loopback is NOT rebound there, see the
 * class doc below).
 *
 * Enforces BOTH checks, independently — a correct token from a non-loopback peer
 * still fails, and a loopback peer with no/wrong token still fails:
 *
 *  1. `Authorization: Bearer <token>` compared against the per-boot
 *     {@link ChatMcpAuthService} token via `crypto.timingSafeEqual` (constant-time).
 *     The length-mismatch case is handled FIRST — `timingSafeEqual` THROWS on
 *     unequal buffer lengths, so a wrong-length token 401s instead of crashing the
 *     request.
 *  2. `req.socket.remoteAddress` is loopback. This is deliberately a request-level
 *     check scoped to this one route, NOT a global `app.listen("127.0.0.1", …)`
 *     rebind — that's a bigger, separate operator call (would also cut off
 *     `/api/health` etc. from any future LAN/mobile access) and is out of scope
 *     here (see `.superpowers/sdd/task-9-brief.md`).
 *
 * Kept deliberately minimal — one injected token holder, a constant header name,
 * no interaction with any (nonexistent) app-wide auth system.
 */
@Injectable()
export class ChatMcpAuthGuard implements CanActivate {
  constructor(private readonly auth: ChatMcpAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<IncomingMessage>();

    const header = req.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException("Missing or malformed Authorization header.");
    }

    const provided = Buffer.from(header.slice(BEARER_PREFIX.length), "utf8");
    const expected = Buffer.from(this.auth.bearerToken, "utf8");
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
