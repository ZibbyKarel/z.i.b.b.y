import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { KbMcpAuthGuard } from "./kb-mcp-auth.guard";

const TOKEN = "a".repeat(64); // same shape as randomBytes(32).toString("hex")

/** Construct a guard, then override its per-boot token with a known value for
 * deterministic assertions — mirrors `chat-mcp-auth.guard.test.ts`'s `makeAuth`. */
function makeGuard(token: string = TOKEN): KbMcpAuthGuard {
  const guard = new KbMcpAuthGuard();
  Object.defineProperty(guard, "token", { value: token });
  return guard;
}

/** A minimal `ExecutionContext` stand-in carrying only what the guard reads:
 * `req.headers.authorization` and `req.socket.remoteAddress`. */
function makeContext(opts: { authorization?: string; remoteAddress?: string }): ExecutionContext {
  const req = {
    headers: opts.authorization !== undefined ? { authorization: opts.authorization } : {},
    socket: { remoteAddress: opts.remoteAddress },
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe("KbMcpAuthGuard", () => {
  it("rejects a request with no Authorization header", () => {
    const guard = makeGuard();
    expect(() => guard.canActivate(makeContext({ remoteAddress: "127.0.0.1" }))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a request with a wrong bearer token", () => {
    const guard = makeGuard();
    expect(() =>
      guard.canActivate(
        makeContext({ authorization: "Bearer not-the-real-token", remoteAddress: "127.0.0.1" }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it("rejects a token of the right length but wrong bytes", () => {
    const guard = makeGuard();
    const wrongSameLength = "b".repeat(TOKEN.length);
    expect(() =>
      guard.canActivate(
        makeContext({ authorization: `Bearer ${wrongSameLength}`, remoteAddress: "127.0.0.1" }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it("rejects a wrong-length token without throwing an unhandled error (timingSafeEqual guard)", () => {
    const guard = makeGuard();
    // timingSafeEqual THROWS on unequal buffer lengths — the guard must catch this
    // case itself and 401, not let it escape as an unhandled 500.
    expect(() =>
      guard.canActivate(makeContext({ authorization: "Bearer short", remoteAddress: "127.0.0.1" })),
    ).toThrow(UnauthorizedException);
  });

  it("rejects a non-loopback remoteAddress even with the correct token", () => {
    const guard = makeGuard();
    expect(() =>
      guard.canActivate(
        makeContext({ authorization: `Bearer ${TOKEN}`, remoteAddress: "192.168.1.5" }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it("rejects a missing remoteAddress even with the correct token", () => {
    const guard = makeGuard();
    expect(() =>
      guard.canActivate(
        makeContext({ authorization: `Bearer ${TOKEN}`, remoteAddress: undefined }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it("accepts the correct token from loopback", () => {
    const guard = makeGuard();
    expect(
      guard.canActivate(
        makeContext({ authorization: `Bearer ${TOKEN}`, remoteAddress: "127.0.0.1" }),
      ),
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
});
