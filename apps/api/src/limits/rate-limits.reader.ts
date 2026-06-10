import { promises as fs } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { Injectable, Optional } from "@nestjs/common"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"

/** The server-computed interactive-window utilization, as whole percents. */
export interface RateLimitSnapshot {
  rolling5hPct: number
  weekly7dPct: number
  /** When the rolling 5h window's utilization resets (epoch ms), or null if unknown. */
  rolling5hResetsAt: number | null
  /** When the weekly window's utilization resets (epoch ms), or null if unknown. */
  weekly7dResetsAt: number | null
  /** When the reading was taken (epoch ms), or null if never. */
  capturedAt: number | null
  /** No fresh reading: either nothing captured yet or the capture has aged out. */
  stale: boolean
}

/**
 * How long a captured status-line reading counts as fresh. The status line only
 * runs while Claude Code is rendering, so a longer gap just means the user
 * stepped away — the last percentages are aging, not wrong — but we flag it so
 * the panel can say so rather than imply a live number.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000

const UNKNOWN: RateLimitSnapshot = {
  rolling5hPct: 0,
  weekly7dPct: 0,
  rolling5hResetsAt: null,
  weekly7dResetsAt: null,
  capturedAt: null,
  stale: true,
}

/**
 * Claude Code's config directory. Honors `CLAUDE_CONFIG_DIR` (Claude Code's own
 * override — when set, every `~/.claude` path lives there instead), falling back
 * to `~/.claude`. The status-line capture and this reader resolve it the same
 * way, so a non-default profile keeps working as long as the backend runs on the
 * same machine and shares the env.
 */
export function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude")
}

/** Round + clamp an unknown value to a `[0, 100]` whole percent; 0 if not a number. */
export function clampPct(v: unknown): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 0
  return Math.min(100, Math.max(0, Math.round(v)))
}

/** A `resets_at` epoch-seconds field → epoch ms, or null if absent/non-numeric. */
function resetMs(v: unknown): number | null {
  if (typeof v !== "number" || Number.isNaN(v)) return null
  return Math.round(v * 1000)
}

/**
 * Parse the JSON the status-line hook writes. Pure and total: any shape we don't
 * recognise degrades to "unknown" rather than throwing. The capture wraps
 * Claude Code's `rate_limits` block — `{ rateLimits: { five_hour: {
 * used_percentage }, seven_day: { used_percentage } }, capturedAt }` — which is
 * the same `anthropic-ratelimit-unified-*` utilization the status line renders.
 */
export function parseRateLimits(raw: string, now: number): RateLimitSnapshot {
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    return UNKNOWN
  }
  if (typeof doc !== "object" || doc === null) return UNKNOWN
  const d = doc as Record<string, unknown>
  const rl = d.rateLimits as Record<string, unknown> | null | undefined
  const five = rl?.five_hour as Record<string, unknown> | undefined
  const seven = rl?.seven_day as Record<string, unknown> | undefined

  const hasReading =
    typeof five?.used_percentage === "number" || typeof seven?.used_percentage === "number"
  const capturedAt = typeof d.capturedAt === "number" ? d.capturedAt : null
  const stale = !hasReading || capturedAt === null || now - capturedAt > STALE_AFTER_MS

  return {
    rolling5hPct: clampPct(five?.used_percentage),
    weekly7dPct: clampPct(seven?.used_percentage),
    rolling5hResetsAt: resetMs(five?.resets_at),
    weekly7dResetsAt: resetMs(seven?.resets_at),
    capturedAt,
    stale,
  }
}

/**
 * Reads the real interactive-window utilization Claude Code shows (the rolling
 * 5h and weekly percentages). Those numbers are computed server-side by
 * Anthropic and only surfaced locally through the status line, which receives
 * them on stdin; they are not in the transcripts or any persisted Claude Code
 * state. So the user's status-line command captures the `rate_limits` block to
 * `<claudeConfigDir>/rate-limits.json`, and this reader consumes that capture —
 * resolving the directory the same way (honoring `CLAUDE_CONFIG_DIR`), so it
 * assumes the backend runs on the same machine as Claude Code. A machine whose
 * status line hasn't wired the capture yet yields "unknown", not an error.
 */
@Injectable()
export class RateLimitsReader {
  private readonly log?: ScopedLogger
  private readonly file = join(claudeConfigDir(), "rate-limits.json")

  // Optional so a test can `new (class extends RateLimitsReader …)()` without DI.
  constructor(@Optional() logger?: LoggerService) {
    this.log = logger?.child(RateLimitsReader.name)
  }

  /** Override point for tests; production reads the wall clock. */
  protected now(): number {
    return Date.now()
  }

  async read(): Promise<RateLimitSnapshot> {
    let raw: string
    try {
      raw = await fs.readFile(this.file, "utf8")
    } catch (err) {
      this.log?.debug("rate-limits capture not readable", { error: (err as Error).message })
      return UNKNOWN
    }
    return parseRateLimits(raw, this.now())
  }
}
