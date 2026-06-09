import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common"
import type { Request, Response } from "express"
import { type Observable, tap } from "rxjs"
import { LoggerService, type ScopedLogger } from "./logger.service"
import { safeStringify } from "./serialize"

/** Keep a request/response body preview bounded — never log it in full. */
const BODY_PREVIEW_MAX = 1000

/**
 * A route whose payloads are pure noise to log: the log-streaming endpoints
 * return potentially huge run-log chunks (and a verbatim echo of them into our
 * own log would be self-defeating). We still log the request line and status —
 * just not the bodies.
 */
function isNoisyBodyRoute(url: string): boolean {
  return url.includes("/logs")
}

/**
 * Logs every HTTP request as it arrives (`→ METHOD url` with route params, query
 * and a truncated body) and again on completion (`← METHOD url status durationMs`
 * with a truncated view of what the handler returned). This is the "what
 * endpoint was called with what params, and what it returned" layer, applied
 * once globally instead of per controller. The trace id is added automatically
 * by {@link LoggerService} from the request scope opened in the trace middleware.
 *
 * Failures are noted briefly here and logged in full (with stack + status) by the
 * exception filter, so "what it returned" covers the error path too.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly log: ScopedLogger

  constructor(logger: LoggerService) {
    this.log = logger.child("HTTP")
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle()

    const http = context.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()
    const method = req.method
    const url = req.originalUrl || req.url
    const startedAt = Date.now()
    const skipBody = isNoisyBodyRoute(url)
    // Reads are polled hard (run/pipeline progress every few hundred ms); logging
    // each at `info` would bury the signal. State-changing calls are the ones worth
    // seeing by default → `info`; reads drop to `debug` (raise LOG_LEVEL to see them).
    const level: "info" | "debug" = method === "GET" || method === "HEAD" ? "debug" : "info"

    this.log[level](`→ ${method} ${url}`, {
      ...(hasKeys(req.params) ? { params: req.params } : {}),
      ...(hasKeys(req.query) ? { query: req.query } : {}),
      ...(skipBody || !hasKeys(req.body) ? {} : { body: preview(req.body) }),
    })

    return next.handle().pipe(
      tap({
        next: (value) => {
          this.log[level](`← ${method} ${url} ${res.statusCode} ${Date.now() - startedAt}ms`, {
            ...(skipBody ? {} : { result: preview(value) }),
          })
        },
        error: (err: unknown) => {
          // The filter logs the full error; here we only mark the timing/route.
          this.log.warn(`✗ ${method} ${url} ${Date.now() - startedAt}ms`, {
            error: err instanceof Error ? err.message : String(err),
          })
        },
      }),
    )
  }
}

function hasKeys(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.keys(value).length > 0
}

function preview(value: unknown): string {
  return safeStringify(value, BODY_PREVIEW_MAX)
}
