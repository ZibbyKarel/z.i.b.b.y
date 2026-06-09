import { Injectable } from "@nestjs/common"
import type { Limits } from "@zibby/contracts"
import { type RateLimitSnapshot, RateLimitsReader } from "./rate-limits.reader"
import { UsageFetcher } from "./usage-fetcher"

/** Shape the raw utilization snapshot into the contract payload. Pure. */
export function buildLimits(snapshot: RateLimitSnapshot): Limits {
  return {
    rolling: { usedPct: snapshot.rolling5hPct, resetsAt: snapshot.rolling5hResetsAt },
    weekly: { usedPct: snapshot.weekly7dPct, resetsAt: snapshot.weekly7dResetsAt },
    capturedAt: snapshot.capturedAt,
    stale: snapshot.stale,
  }
}

/**
 * How long a live reading is reused before we fetch again. A request inside this
 * window returns the cached snapshot, so the frontend's poll doesn't translate
 * into one Anthropic call per poll. The cache also expires the instant a window
 * resets (see {@link LimitsService.refresh}), so the first request after a reset
 * sees fresh numbers.
 */
export const CACHE_TTL_MS = 10 * 60 * 1000

/**
 * Computes the interactive-limits readout backing the dashboard panel.
 *
 * Layer 1: {@link UsageFetcher} reads the authoritative 5h/weekly utilization
 * (and reset times) straight off a minimal Anthropic request — fresh whenever we
 * ask. {@link RateLimitsReader} (the status-line capture) is the fallback when no
 * token/network is available. Readings are cached for {@link CACHE_TTL_MS}, but no
 * later than the earliest window reset, and concurrent requests share one
 * in-flight fetch — so the frontend can poll freely without a fetch per poll.
 *
 * Layer 2: a usage-limit signal scraped from a `claude` run's output calls
 * {@link noteLimitHit}, which busts the cache so the next request re-fetches the
 * authoritative percentages.
 */
@Injectable()
export class LimitsService {
  private cache: { snapshot: RateLimitSnapshot; expiresAt: number } | null = null
  private inflight: Promise<RateLimitSnapshot> | null = null

  constructor(
    private readonly reader: RateLimitsReader,
    private readonly fetcher: UsageFetcher,
  ) {}

  /** Override point for tests; production reads the wall clock. */
  protected now(): number {
    return Date.now()
  }

  async snapshot(): Promise<Limits> {
    return buildLimits(await this.current())
  }

  /** Drop the cached reading so the next request fetches a fresh one. */
  noteLimitHit(): void {
    this.cache = null
  }

  /** The current snapshot — cached, in-flight-deduped, or freshly fetched. */
  private async current(): Promise<RateLimitSnapshot> {
    const now = this.now()
    if (this.cache && now < this.cache.expiresAt) return this.cache.snapshot
    if (this.inflight) return this.inflight
    this.inflight = this.refresh(now).finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  /** Fetch live (fallback to the capture), then cache until the soonest of TTL / reset. */
  private async refresh(now: number): Promise<RateLimitSnapshot> {
    const snapshot = (await this.fetcher.fetch()) ?? (await this.reader.read())
    const resets = [snapshot.rolling5hResetsAt, snapshot.weekly7dResetsAt].filter(
      (r): r is number => typeof r === "number" && r > now,
    )
    const expiresAt = Math.min(now + CACHE_TTL_MS, ...resets)
    this.cache = { snapshot, expiresAt }
    return snapshot
  }
}
