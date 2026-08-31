import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { KbAuthedRequest } from "./kb-mcp-auth.guard";
import { KbMcpAuthGuard } from "./kb-mcp-auth.guard";
import { KbMcpAuthService } from "./kb-mcp-auth.service";

const RUN_TOKEN = "a".repeat(64); // same shape as randomBytes(32).toString("hex")
const CHAT_TOKEN = "c".repeat(64);

/** A plain class, no NestJS TestingModule needed — construct directly, then
 * override its two private, immutable tokens with known values (it mints
 * fresh random ones per instance) for deterministic assertions — mirrors
 * `chat-mcp-auth.guard.test.ts`'s `makeAuth`. */
function makeAuth(run: string = RUN_TOKEN, chat: string = CHAT_TOKEN): KbMcpAuthService {
  const auth = new KbMcpAuthService();
  Object.defineProperty(auth, "runToken", { value: run });
  Object.defineProperty(auth, "chatToken", { value: chat });
  return auth;
}

/** A minimal `ExecutionContext` stand-in carrying only what the guard reads
 * (`req.headers.authorization`, `req.socket.remoteAddress`) — returns the
 * backing `req` too, so a test can assert what the guard wrote onto it
 * (`kbCaller`). */
function makeContext(opts: { authorization?: string; remoteAddress?: string }): {
  context: ExecutionContext;
  req: KbAuthedRequest;
} {
  const req = {
    headers: opts.authorization !== undefined ? { authorization: opts.authorization } : {},
    socket: { remoteAddress: opts.remoteAddress },
  } as unknown as KbAuthedRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

describe("KbMcpAuthGuard", () => {
  it("rejects a request with no Authorization header", () => {
    const guard = new KbMcpAuthGuard(makeAuth());
    const { context } = makeContext({ remoteAddress: "127.0.0.1" });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects a wrong bearer token (neither the run nor the chat token)", () => {
    const guard = new KbMcpAuthGuard(makeAuth());
    const { context } = makeContext({
      authorization: "Bearer not-the-real-token",
      remoteAddress: "127.0.0.1",
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects a same-length wrong token against BOTH tokens", () => {
    const guard = new KbMcpAuthGuard(makeAuth());
    const wrongSameLength = "b".repeat(RUN_TOKEN.length);
    const { context } = makeContext({
      authorization: `Bearer ${wrongSameLength}`,
      remoteAddress: "127.0.0.1",
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects a wrong-length token without throwing an unhandled error (timingSafeEqual guard)", () => {
    const guard = new KbMcpAuthGuard(makeAuth());
    // timingSafeEqual THROWS on unequal buffer lengths — the guard must catch this
    // case itself and 401, not let it escape as an unhandled 500, against EITHER token.
    const { context } = makeContext({ authorization: "Bearer short", remoteAddress: "127.0.0.1" });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects a non-loopback remoteAddress even with a correct token — either one", () => {
    const guard = new KbMcpAuthGuard(makeAuth());
    const { context: runCtx } = makeContext({
      authorization: `Bearer ${RUN_TOKEN}`,
      remoteAddress: "192.168.1.5",
    });
    expect(() => guard.canActivate(runCtx)).toThrow(UnauthorizedException);
    const { context: chatCtx } = makeContext({
      authorization: `Bearer ${CHAT_TOKEN}`,
      remoteAddress: "192.168.1.5",
    });
    expect(() => guard.canActivate(chatCtx)).toThrow(UnauthorizedException);
  });

  it("rejects a missing remoteAddress even with the correct token", () => {
    const guard = new KbMcpAuthGuard(makeAuth());
    const { context } = makeContext({
      authorization: `Bearer ${RUN_TOKEN}`,
      remoteAddress: undefined,
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('accepts the RUN token from loopback and records req.kbCaller === "run"', () => {
    const guard = new KbMcpAuthGuard(makeAuth());
    const { context, req } = makeContext({
      authorization: `Bearer ${RUN_TOKEN}`,
      remoteAddress: "127.0.0.1",
    });
    expect(guard.canActivate(context)).toBe(true);
    expect(req.kbCaller).toBe("run");
  });

  it('accepts the CHAT token from loopback and records req.kbCaller === "chat"', () => {
    const guard = new KbMcpAuthGuard(makeAuth());
    const { context, req } = makeContext({
      authorization: `Bearer ${CHAT_TOKEN}`,
      remoteAddress: "127.0.0.1",
    });
    expect(guard.canActivate(context)).toBe(true);
    expect(req.kbCaller).toBe("chat");
  });

  it("accepts either token from ::1 and ::ffff:127.0.0.1 too", () => {
    const guard = new KbMcpAuthGuard(makeAuth());
    for (const remoteAddress of ["::1", "::ffff:127.0.0.1"]) {
      const { context: runCtx } = makeContext({
        authorization: `Bearer ${RUN_TOKEN}`,
        remoteAddress,
      });
      expect(guard.canActivate(runCtx)).toBe(true);
      const { context: chatCtx } = makeContext({
        authorization: `Bearer ${CHAT_TOKEN}`,
        remoteAddress,
      });
      expect(guard.canActivate(chatCtx)).toBe(true);
    }
  });
});
