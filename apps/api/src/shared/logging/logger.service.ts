import { Injectable, Logger } from "@nestjs/common"
import { safeStringify } from "./serialize"
import { TraceContextService } from "./trace-context.service"

/** Structured fields attached to a log line. */
export type LogMeta = Record<string, unknown>

/** Severities, ordered least → most severe; the env threshold gates on this. */
const LEVELS = ["debug", "info", "warn", "error"] as const
type Level = (typeof LEVELS)[number]

/**
 * Lowest level that is actually emitted, from `LOG_LEVEL` (default `info`).
 * `LOG_LEVEL=debug` opens up the per-step service tracing; an unknown value
 * falls back to `info` rather than silencing everything.
 */
function threshold(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase()
  const i = LEVELS.indexOf(raw as Level)
  return i === -1 ? LEVELS.indexOf("info") : i
}

/**
 * A logger bound to one context label (typically a class name). This is what
 * services hold — `logger.child(MyService.name)` — so every line is tagged with
 * where it came from without repeating the context at each call.
 */
export interface ScopedLogger {
  debug(message: string, meta?: LogMeta): void
  info(message: string, meta?: LogMeta): void
  warn(message: string, meta?: LogMeta): void
  error(message: string, meta?: LogMeta): void
}

/**
 * The single application logger. Wraps Nest's built-in {@link Logger} (so it
 * shares the framework's stdout transport, colours and level handling) and adds
 * two things on top:
 *
 * 1. **Structured metadata** — every call may carry a `meta` object that is
 *    serialized (bounded, cycle-safe) onto the line.
 * 2. **Automatic correlation** — the active {@link TraceStore} (traceId / runId)
 *    is merged into every line via {@link TraceContextService}, so a request and
 *    all the background work it spawns share an id without callers passing it.
 *
 * It is the one place that decides *how* a log line looks; swapping the stdout
 * backend later (e.g. pino) is a change here and nowhere else. Set
 * `LOG_JSON=1` to emit one JSON object per line instead of Nest's pretty format.
 */
@Injectable()
export class LoggerService {
  private readonly backend = new Logger()
  private readonly minLevel = threshold()
  private readonly json = process.env.LOG_JSON === "1" || process.env.LOG_JSON === "true"

  constructor(private readonly trace: TraceContextService) {}

  /** A logger tagged with `context` (usually a class name). */
  child(context: string): ScopedLogger {
    return {
      debug: (message, meta) => this.write("debug", context, message, meta),
      info: (message, meta) => this.write("info", context, message, meta),
      warn: (message, meta) => this.write("warn", context, message, meta),
      error: (message, meta) => this.write("error", context, message, meta),
    }
  }

  debug(message: string, meta?: LogMeta): void {
    this.write("debug", "App", message, meta)
  }

  info(message: string, meta?: LogMeta): void {
    this.write("info", "App", message, meta)
  }

  warn(message: string, meta?: LogMeta): void {
    this.write("warn", "App", message, meta)
  }

  error(message: string, meta?: LogMeta): void {
    this.write("error", "App", message, meta)
  }

  private write(level: Level, context: string, message: string, meta?: LogMeta): void {
    if (LEVELS.indexOf(level) < this.minLevel) return

    const fields: LogMeta = { ...this.trace.snapshot(), ...(meta ?? {}) }
    const stack = typeof fields.stack === "string" ? fields.stack : undefined

    if (this.json) {
      // One JSON object per line — for prod log shippers. `time` is the ingest
      // hint; the rest is flattened so traceId/runId are top-level filterable.
      const line = safeStringify({ level, context, message, time: new Date().toISOString(), ...fields })
      if (level === "error") process.stderr.write(`${line}\n`)
      else process.stdout.write(`${line}\n`)
      return
    }

    const json = Object.keys(fields).length > 0 ? safeStringify(fields) : ""
    const line = json ? `${message} ${json}` : message
    switch (level) {
      case "debug":
        this.backend.debug(line, context)
        break
      case "info":
        this.backend.log(line, context)
        break
      case "warn":
        this.backend.warn(line, context)
        break
      case "error":
        this.backend.error(line, stack, context)
        break
    }
  }
}
