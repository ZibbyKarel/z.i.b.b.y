import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { TraceContextService } from "./trace-context.service";

/** Request/response header carrying the correlation id across the boundary. */
export const TRACE_HEADER = "x-trace-id";

/**
 * The first thing that runs on every request: assign (or adopt) a trace id and
 * open an {@link TraceContextService} scope around the rest of the request, so
 * every downstream log line — interceptor, controller, service — is tagged with
 * the same `traceId`. An inbound `x-trace-id` is trusted and reused (lets a
 * caller stitch its own trace to ours); otherwise we mint a UUID. The id is
 * echoed back on the response so a client can quote it when reporting an issue.
 *
 * Applied for every route by {@link LoggingModule}'s `configure`, so it runs for
 * both the production bootstrap and the e2e test harness (which never executes
 * `main.ts`), ahead of the rest of the Nest pipeline — interceptors and the
 * exception filter included.
 */
export function createTraceMiddleware(trace: TraceContextService) {
  return function traceMiddleware(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[TRACE_HEADER];
    const provided = (Array.isArray(incoming) ? incoming[0] : incoming)?.trim();
    const traceId = provided && provided.length > 0 ? provided : randomUUID();
    res.setHeader(TRACE_HEADER, traceId);
    trace.run({ traceId }, () => next());
  };
}
