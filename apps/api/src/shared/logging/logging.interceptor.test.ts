import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Request, Response } from "express";
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import type { LoggerService, ScopedLogger } from "./logger.service";
import { LoggingInterceptor, isSkippedBodyRoute } from "./logging.interceptor";

function fakeLogger(): { logger: LoggerService; scoped: ScopedLogger } {
  const scoped: ScopedLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const logger = { child: () => scoped } as unknown as LoggerService;
  return { logger, scoped };
}

function fakeContext(req: Partial<Request>, res: Partial<Response> = { statusCode: 200 }) {
  const context = {
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => req as Request,
      getResponse: () => res as Response,
    }),
  } as unknown as ExecutionContext;
  return context;
}

function fakeHandler(result: unknown): CallHandler {
  return { handle: () => of(result) };
}

/** The metadata object passed to `scoped.info` on its `index`-th call. */
function infoMeta(scoped: ScopedLogger, index: number): Record<string, unknown> {
  const call = (scoped.info as ReturnType<typeof vi.fn>).mock.calls[index];
  if (!call) throw new Error(`expected a scoped.info call at index ${index}`);
  return call[1] as Record<string, unknown>;
}

describe("isSkippedBodyRoute", () => {
  it("skips /credentials routes", () => {
    expect(isSkippedBodyRoute("/api/integrations/abc/credentials")).toBe(true);
  });

  it("skips /secrets routes", () => {
    expect(isSkippedBodyRoute("/api/projects/abc/secrets")).toBe(true);
  });

  it("skips /logs routes (existing behavior preserved)", () => {
    expect(isSkippedBodyRoute("/api/tasks/runs/abc/logs")).toBe(true);
  });

  it("does not skip an ordinary mutation route", () => {
    expect(isSkippedBodyRoute("/api/projects/abc")).toBe(false);
  });
});

describe("LoggingInterceptor", () => {
  it("logs a redacted body and result for a normal mutation route", async () => {
    const { logger, scoped } = fakeLogger();
    const interceptor = new LoggingInterceptor(logger);
    const req: Partial<Request> = {
      method: "PUT",
      originalUrl: "/api/projects/abc",
      params: { id: "abc" },
      query: {},
      body: { name: "abc", password: "hunter2" },
    };
    const context = fakeContext(req);
    const handler = fakeHandler({ id: "abc", token: "should-not-leak" });

    await firstValueFrom(interceptor.intercept(context, handler));

    expect(scoped.info).toHaveBeenCalledTimes(2);
    const [requestLine, requestMeta] = (scoped.info as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, Record<string, unknown>];
    expect(requestLine).toBe("→ PUT /api/projects/abc");
    expect(requestMeta.body).toContain("[redacted]");
    expect(requestMeta.body).not.toContain("hunter2");

    const [, resultMeta] = (scoped.info as ReturnType<typeof vi.fn>).mock.calls[1] as [
      string,
      Record<string, unknown>,
    ];
    expect(resultMeta.result).toContain("[redacted]");
    expect(resultMeta.result).not.toContain("should-not-leak");
  });

  it("skips body and result previews entirely for /credentials routes", async () => {
    const { logger, scoped } = fakeLogger();
    const interceptor = new LoggingInterceptor(logger);
    const req: Partial<Request> = {
      method: "PUT",
      originalUrl: "/api/integrations/abc/credentials",
      params: { id: "abc" },
      query: {},
      body: { botToken: "xoxb-secret" },
    };
    const context = fakeContext(req);
    const handler = fakeHandler({ ok: true, botToken: "xoxb-secret" });

    await firstValueFrom(interceptor.intercept(context, handler));

    const requestMeta = infoMeta(scoped, 0);
    expect(requestMeta.body).toBeUndefined();

    const resultMeta = infoMeta(scoped, 1);
    expect(resultMeta.result).toBeUndefined();
  });

  it("skips body and result previews entirely for /secrets routes", async () => {
    const { logger, scoped } = fakeLogger();
    const interceptor = new LoggingInterceptor(logger);
    const req: Partial<Request> = {
      method: "PUT",
      originalUrl: "/api/projects/abc/secrets",
      params: { id: "abc" },
      query: {},
      body: { RUN_SECRET: "shh" },
    };
    const context = fakeContext(req);
    const handler = fakeHandler({ ok: true });

    await firstValueFrom(interceptor.intercept(context, handler));

    const requestMeta = infoMeta(scoped, 0);
    expect(requestMeta.body).toBeUndefined();
  });

  it("still skips /logs routes (existing behavior preserved)", async () => {
    const { logger, scoped } = fakeLogger();
    const interceptor = new LoggingInterceptor(logger);
    const req: Partial<Request> = {
      method: "POST",
      originalUrl: "/api/tasks/runs/abc/logs",
      params: {},
      query: {},
      body: { chunk: "a".repeat(2000) },
    };
    const context = fakeContext(req);
    const handler = fakeHandler({ chunk: "a".repeat(2000) });

    await firstValueFrom(interceptor.intercept(context, handler));

    const requestMeta = infoMeta(scoped, 0);
    expect(requestMeta.body).toBeUndefined();
    const resultMeta = infoMeta(scoped, 1);
    expect(resultMeta.result).toBeUndefined();
  });
});
