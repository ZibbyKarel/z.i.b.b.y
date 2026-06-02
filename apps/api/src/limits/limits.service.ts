import { Injectable } from "@nestjs/common"
import type { Limits } from "@zibby/contracts"
import { type RateLimitSnapshot, RateLimitsReader } from "./rate-limits.reader"

/** Shape the raw utilization snapshot into the contract payload. Pure. */
export function buildLimits(snapshot: RateLimitSnapshot): Limits {
  return {
    rolling: { usedPct: snapshot.rolling5hPct },
    weekly: { usedPct: snapshot.weekly7dPct },
    capturedAt: snapshot.capturedAt,
    stale: snapshot.stale,
  }
}

/**
 * Computes the interactive-limits readout backing the dashboard panel.
 * {@link RateLimitsReader} supplies the real server-computed 5h/weekly
 * utilization (captured from the Claude Code status line); this service only
 * shapes it into the contract payload. A machine with no capture yet yields a
 * stale, zeroed snapshot, not an error.
 */
@Injectable()
export class LimitsService {
  constructor(private readonly reader: RateLimitsReader) {}

  async snapshot(): Promise<Limits> {
    return buildLimits(await this.reader.read())
  }
}
