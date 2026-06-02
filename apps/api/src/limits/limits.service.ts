import { Injectable } from "@nestjs/common"
import type { LimitWindow, Limits } from "@zibby/contracts"
import { ClaudeUsageReader, type UsageWindows } from "./usage.reader"

/**
 * Token ceilings for the interactive windows, in tokens. These are the plan's
 * fixed caps the dashboard gauges against; they were sized around input+output
 * tokens (which is what {@link ClaudeUsageReader} sums). Overridable via env for
 * a different plan without a code change.
 */
export const LIMIT_CAPS = {
  rollingTokens: Number(process.env.LIMITS_ROLLING_TOKENS ?? 200_000),
  weeklyTokens: Number(process.env.LIMITS_WEEKLY_TOKENS ?? 5_000_000),
} as const

/** `round(used / limit * 100)`, clamped to `[0, 100]`; `0` when the limit is `0`. */
export function usedPct(used: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)))
}

function deriveWindow(usedTokens: number, limitTokens: number): LimitWindow {
  return { usedTokens, limitTokens, usedPct: usedPct(usedTokens, limitTokens) }
}

/** Shape the raw windowed token counts into the contract payload. Pure. */
export function buildLimits(usage: UsageWindows, caps = LIMIT_CAPS): Limits {
  return {
    rolling: deriveWindow(usage.rolling5hTokens, caps.rollingTokens),
    weekly: deriveWindow(usage.weekly7dTokens, caps.weeklyTokens),
  }
}

/**
 * Computes the interactive-limits readout backing the dashboard panel from real
 * local usage. {@link ClaudeUsageReader} supplies the windowed token totals; this
 * service only derives `usedPct` against the configured caps. A fresh machine
 * with no transcripts yields zero usage, not an error.
 */
@Injectable()
export class LimitsService {
  constructor(private readonly usage: ClaudeUsageReader) {}

  async snapshot(): Promise<Limits> {
    const windows = await this.usage.read()
    return buildLimits(windows)
  }
}
