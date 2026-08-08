import type { Server } from "node:http";
import type { HttpAdapterHost } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoggerService } from "../logging/logger.service";
import { HttpConnectionReaper } from "./http-connection-reaper.service";

/**
 * A fake `http.Server` whose open-connection count the test drives. `connections`
 * is read on every `getConnections` call, so a test can let it drain mid-wait.
 */
function fakeServer(connections: () => number) {
  return {
    closeIdleConnections: vi.fn(),
    closeAllConnections: vi.fn(),
    getConnections: vi.fn((cb: (err: Error | null, count: number) => void) =>
      cb(null, connections()),
    ),
  };
}

function makeReaper(server: unknown): HttpConnectionReaper {
  const logger = { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) };
  const host = { httpAdapter: server ? { getHttpServer: () => server } : undefined };
  return new HttpConnectionReaper(
    host as unknown as HttpAdapterHost,
    logger as unknown as LoggerService,
  );
}

describe("HttpConnectionReaper", () => {
  beforeEach(() => {
    delete process.env.HTTP_SHUTDOWN_GRACE_MS;
  });

  it("destroys connections that never drain — the SSE streams that hung shutdown", async () => {
    // An SSE stream never ends on its own, so the count never falls: without the
    // forced close, Node's server.close() stays pending and the process never exits.
    const server = fakeServer(() => 2);
    process.env.HTTP_SHUTDOWN_GRACE_MS = "50";
    await makeReaper(server).beforeApplicationShutdown();
    expect(server.closeIdleConnections).toHaveBeenCalled();
    expect(server.closeAllConnections).toHaveBeenCalled();
  });

  it("does not force anything when connections drain within the grace", async () => {
    let open = 1;
    const server = fakeServer(() => open);
    process.env.HTTP_SHUTDOWN_GRACE_MS = "1000";
    const done = makeReaper(server).beforeApplicationShutdown();
    setTimeout(() => {
      open = 0;
    }, 30);
    await done;
    expect(server.closeIdleConnections).toHaveBeenCalled();
    // Drained on its own — no socket had to be destroyed under a client.
    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });

  it("returns immediately when nothing is open", async () => {
    const server = fakeServer(() => 0);
    await makeReaper(server).beforeApplicationShutdown();
    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });

  it("is a no-op when there is no http server, rather than throwing in a shutdown hook", async () => {
    await expect(makeReaper(undefined).beforeApplicationShutdown()).resolves.toBeUndefined();
  });

  it("tolerates a runtime without closeAllConnections instead of crashing the shutdown", async () => {
    const legacy = { closeIdleConnections: vi.fn(), getConnections: vi.fn() };
    await expect(
      makeReaper(legacy as unknown as Server).beforeApplicationShutdown(),
    ).resolves.toBeUndefined();
    expect(legacy.closeIdleConnections).not.toHaveBeenCalled();
  });
});
