import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";

/**
 * What we carry alongside any unit of work so its logs can be correlated.
 *
 * - `traceId` — one HTTP request (assigned by the trace middleware, the first
 *   thing that runs when a request arrives).
 * - `runId` — one agent / pipeline run. Background work (the run watcher, a
 *   mid-run approval gate, a scheduler tick) executes *after* the request that
 *   started it has returned, so it has no live request context; it re-enters a
 *   fresh store keyed by the run's id, carrying the originating `traceId` along
 *   so a scheduler- or request-started run still links back to its origin.
 */
export interface TraceStore {
  traceId: string;
  runId?: string;
}

/**
 * A thin wrapper over a single {@link AsyncLocalStorage} that holds the current
 * {@link TraceStore}. Injected wherever a logical scope must be established
 * (the HTTP middleware, the runners' background drivers, the scheduler) and read
 * implicitly by {@link LoggerService} so every log line picks up the trace/run
 * ids without callers threading them through every signature.
 */
@Injectable()
export class TraceContextService {
  private readonly als = new AsyncLocalStorage<TraceStore>();

  /** Run `fn` (and everything it awaits) within `store`. */
  run<T>(store: TraceStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  /** The active store as a plain object (empty when outside any scope). */
  snapshot(): Partial<TraceStore> {
    return this.als.getStore() ?? {};
  }

  getTraceId(): string | undefined {
    return this.als.getStore()?.traceId;
  }

  getRunId(): string | undefined {
    return this.als.getStore()?.runId;
  }
}
