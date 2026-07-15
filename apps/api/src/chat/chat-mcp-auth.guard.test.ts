import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ChatMcpAuthGuard } from "./chat-mcp-auth.guard";
import { ChatMcpAuthService } from "./chat-mcp-auth.service";

const TOKEN = "a".repeat(64); // same shape as randomBytes(32).toString("hex")

/** A plain class, no NestJS TestingModule needed — construct directly. */
function makeAuth(token: string = TOKEN): ChatMcpAuthService {
  const auth = new ChatMcpAuthService();
  // Override the private, immutable token with a known value for deterministic
  // assertions — ChatMcpAuthService mints a fresh random one per instance.
  Object.defineProperty(auth, "token", { value: token });
  return auth;
}

/** A minimal `ExecutionContext` stand-in carrying only what the guard reads:
 * `req.headers.authorization` and `req.socket.remoteAddress`. */
function makeContext(opts: {
  authorization?: string;
  remoteAddress?: string;
}): ExecutionContext {
  const req = {
    headers: opts.authorization !== undefined ? { authorization: opts.authorization } : {},
    socket: { remoteAddress: opts.remoteAddress },
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe("ChatMcpAuthGuard", () => {
  it("rejects a missing Authorization header", () => {
    const guard = new ChatMcpAuthGuard(makeAuth());
    expect(() => guard.canActivate(makeContext({ remoteAddress: "127.0.0.1" }))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a malformed header (not 'Bearer <token>')", () => {
    const guard = new ChatMcpAuthGuard(makeAuth());
    expect(() =>
      guard.canActivate(makeContext({ authorization: TOKEN, remoteAddress: "127.0.0.1" })),
    ).toThrow(UnauthorizedException);
    expect(() =>
      guard.canActivate(
        makeContext({ authorization: `Basic ${TOKEN}`, remoteAddress: "127.0.0.1" }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it("rejects a wrong token of the SAME length as the real one", () => {
    const guard = new ChatMcpAuthGuard(makeAuth());
    const wrongSameLength = "b".repeat(TOKEN.length);
    expect(() =>
      guard.canActivate(
        makeContext({ authorization: `Bearer ${wrongSameLength}`, remoteAddress: "127.0.0.1" }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it("rejects a wrong-length token without throwing an unhandled error (timingSafeEqual guard)", () => {
    const guard = new ChatMcpAuthGuard(makeAuth());
    // timingSafeEqual THROWS on unequal buffer lengths — the guard must catch this
    // case itself and 401, not let it escape as an unhandled 500.
    expect(() =>
      guard.canActivate(makeContext({ authorization: "Bearer short", remoteAddress: "127.0.0.1" })),
    ).toThrow(UnauthorizedException);
  });

  it("accepts the exact matching token from a loopback peer", () => {
    const guard = new ChatMcpAuthGuard(makeAuth());
    expect(
      guard.canActivate(makeContext({ authorization: `Bearer ${TOKEN}`, remoteAddress: "127.0.0.1" })),
    ).toBe(true);
    expect(
      guard.canActivate(makeContext({ authorization: `Bearer ${TOKEN}`, remoteAddress: "::1" })),
    ).toBe(true);
    expect(
      guard.canActivate(
        makeContext({ authorization: `Bearer ${TOKEN}`, remoteAddress: "::ffff:127.0.0.1" }),
      ),
    ).toBe(true);
  });

  it("rejects the CORRECT token from a non-loopback remoteAddress — both checks enforced", () => {
    const guard = new ChatMcpAuthGuard(makeAuth());
    expect(() =>
      guard.canActivate(
        makeContext({ authorization: `Bearer ${TOKEN}`, remoteAddress: "192.168.1.5" }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it("rejects a missing remoteAddress even with the correct token", () => {
    const guard = new ChatMcpAuthGuard(makeAuth());
    expect(() =>
      guard.canActivate(makeContext({ authorization: `Bearer ${TOKEN}`, remoteAddress: undefined })),
    ).toThrow(UnauthorizedException);
  });
});
