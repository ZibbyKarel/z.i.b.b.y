import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

/**
 * Per-boot shared secret for the in-process chat MCP endpoint (`POST /api/chat/mcp`).
 * Minted ONCE at construction — `randomBytes(32).toString("hex")` — kept in memory
 * only: no env var, no persistence, no rotation. It dies with the process; a restart
 * mints a fresh one, which is fine because the same process that serves the route
 * also spawns the `claude` CLI that consumes it (see `ChatSessionService`).
 *
 * SINGLE source of truth: inject this into both {@link "./chat-mcp-auth.guard".ChatMcpAuthGuard}
 * (verifies the bearer header) and `ChatSessionService` (propagates the token to the
 * spawned CLI's `--mcp-config` headers, off argv) — never mint the token twice.
 */
@Injectable()
export class ChatMcpAuthService {
  private readonly token = randomBytes(32).toString("hex");

  /** This boot's bearer token for `POST /api/chat/mcp`. */
  get bearerToken(): string {
    return this.token;
  }
}
