import type { Server } from "node:http";
import { type BeforeApplicationShutdown, Injectable } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { LoggerService, type ScopedLogger } from "../logging/logger.service";

/** How long a still-open connection gets to drain before it is destroyed. */
const DEFAULT_GRACE_MS = 250;
/** Drain poll interval — short, so a clean drain exits well before the grace ends. */
const POLL_MS = 25;

/**
 * Force-closes lingering HTTP connections at shutdown, so the process can actually
 * exit.
 *
 * **The bug this fixes.** `app.enableShutdownHooks()` makes SIGTERM run
 * `app.close()`, whose `dispose()` step calls Node's `server.close()`. That closes
 * the *listening* socket but then waits for every already-open connection to end on
 * its own. This API serves SSE (`/api/events`, run/stage log streams, chat) and an
 * SSE stream by definition never ends — so `server.close()` never completed, the
 * process hung forever, and `ts-node-dev --respawn` could not restart it. The
 * observable signature was exactly that: process alive, sockets ESTABLISHED, **no
 * LISTEN socket**, every request answering with a connection failure. Reproduced
 * deterministically — with one SSE client attached the process was still alive 20 s
 * after SIGTERM; with none it exited in ~2 s.
 *
 * **Why `beforeApplicationShutdown`.** Nest's close order is
 * `onModuleDestroy` → `beforeApplicationShutdown` → `dispose()` (the hang) →
 * `onApplicationShutdown`. This hook is the last point that still runs *before*
 * `server.close()`, so by the time Nest gets there the connections are already gone
 * and it resolves immediately. An `onApplicationShutdown` hook would never be
 * reached, and racing Nest's own signal handler from `main.ts` would be
 * order-dependent — this is deterministic.
 *
 * Idle (keep-alive) sockets are closed first and given {@link DEFAULT_GRACE_MS} to
 * drain, so a genuinely in-flight request can still finish; whatever remains after
 * that — the streams — is destroyed. The grace is deliberately short: SSE never
 * drains, so any longer wait is a fixed cost paid on every single dev restart while
 * achieving nothing for the streams it is waiting on. `HTTP_SHUTDOWN_GRACE_MS`
 * raises it for the launchd/production path if a slow request ever warrants it.
 */
@Injectable()
export class HttpConnectionReaper implements BeforeApplicationShutdown {
  private readonly log: ScopedLogger;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    logger: LoggerService,
  ) {
    this.log = logger.child(HttpConnectionReaper.name);
  }

  async beforeApplicationShutdown(): Promise<void> {
    const server = this.adapterHost.httpAdapter?.getHttpServer() as Server | undefined;
    // `closeAllConnections` is Node 18.2+. Absent it there is nothing to do here and
    // the old hang returns — but every supported runtime has it, and guarding beats
    // throwing inside a shutdown hook (which would mask the real shutdown reason).
    if (typeof server?.closeAllConnections !== "function") return;

    // Keep-alive sockets sitting idle between requests are free to drop immediately.
    server.closeIdleConnections();

    const graceMs = intEnv("HTTP_SHUTDOWN_GRACE_MS", DEFAULT_GRACE_MS);
    const deadline = Date.now() + graceMs;
    let remaining = await countConnections(server);
    while (remaining > 0 && Date.now() < deadline) {
      await sleep(POLL_MS);
      remaining = await countConnections(server);
    }

    if (remaining > 0) {
      // Expected on any restart with the web app open — the streams are working as
      // designed. Logged so a shutdown that had to force sockets is never invisible.
      this.log.debug("destroying connections that did not drain (streams)", { remaining });
      server.closeAllConnections();
    }
  }
}

/** Open connection count, or 0 if the server can no longer answer. */
function countConnections(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.getConnections((err, count) => resolve(err ? 0 : count));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a non-negative integer env var, falling back to `dflt` on absent/garbage. */
function intEnv(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}
