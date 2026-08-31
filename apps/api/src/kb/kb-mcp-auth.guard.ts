import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { KbMcpAuthService } from "./kb-mcp-auth.service";

const BEARER_PREFIX = "Bearer ";

/** Addresses Node considers "this machine" for a TCP peer. IPv4-mapped IPv6
 * (`::ffff:127.0.0.1`) shows up when the server also accepts IPv6 connections. */
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Which per-boot token authenticated a `POST /api/kb/mcp` request. This —
 * never the presence or absence of `X-Zibby-Run-Id` — is what
 * `KbMcpController` branches its roots-resolution path on. See
 * `KbMcpAuthService`'s class doc for why two tokens exist, and
 * `KbMcpController`'s for the four-row truth table this decides. */
export type KbCaller = "run" | "chat";

/** `IncomingMessage` carrying the caller identity `KbMcpAuthGuard` determined.
 * Set ONLY on a request that passed both guard checks — a handler behind
 * `@UseGuards(KbMcpAuthGuard)` can rely on `kbCaller` being present. */
export interface KbAuthedRequest extends IncomingMessage {
  kbCaller?: KbCaller;
}

/**
 * Locks down `POST /api/kb/mcp` — the in-process MCP endpoint exposing the
 * `zibby-kb` server (team-knowledge-base search/read). Mirrors
 * `ChatMcpAuthGuard` (`../chat/chat-mcp-auth.guard.ts`) exactly on both
 * checks, enforced independently — a correct token from a non-loopback peer
 * still fails, and a loopback peer with no/wrong token still fails — with ONE
 * addition: TWO valid tokens, not one (fix round 1, finding F3).
 *
 *  1. `Authorization: Bearer <token>` compared, in constant time, against
 *     BOTH {@link KbMcpAuthService.runBearerToken} and
 *     {@link KbMcpAuthService.chatBearerToken} via `crypto.timingSafeEqual`.
 *     The length-mismatch case is handled FIRST for EACH comparison —
 *     `timingSafeEqual` THROWS on unequal buffer lengths, so a wrong-length
 *     token 401s instead of crashing the request. Having two tokens to check
 *     does not weaken either individual comparison.
 *  2. `req.socket.remoteAddress` is loopback — independent of which token
 *     matched.
 *
 * Whichever token matched is recorded as `req.kbCaller` — this, not
 * `X-Zibby-Run-Id`, is what `KbMcpController` uses to pick its
 * roots-resolution path (see that controller's class doc for the four-row
 * table). This guard is the **sole authentication boundary** for the
 * `zibby-kb` endpoint.
 */
@Injectable()
export class KbMcpAuthGuard implements CanActivate {
  constructor(private readonly auth: KbMcpAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<KbAuthedRequest>();

    const header = req.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException("Missing or malformed Authorization header.");
    }

    const provided = Buffer.from(header.slice(BEARER_PREFIX.length), "utf8");
    const caller = this.matchCaller(provided);
    if (!caller) {
      throw new UnauthorizedException("Invalid token.");
    }

    const remoteAddress = req.socket.remoteAddress;
    if (!remoteAddress || !LOOPBACK_ADDRESSES.has(remoteAddress)) {
      throw new UnauthorizedException("Not a loopback peer.");
    }

    req.kbCaller = caller;
    return true;
  }

  /** Constant-time match against EITHER per-boot token. Same
   * length-check-first-then-`timingSafeEqual` discipline as a single-token
   * comparison, simply run twice — neither comparison is weakened. */
  private matchCaller(provided: Buffer): KbCaller | undefined {
    const run = Buffer.from(this.auth.runBearerToken, "utf8");
    if (provided.length === run.length && timingSafeEqual(provided, run)) {
      return "run";
    }
    const chat = Buffer.from(this.auth.chatBearerToken, "utf8");
    if (provided.length === chat.length && timingSafeEqual(provided, chat)) {
      return "chat";
    }
    return undefined;
  }
}
