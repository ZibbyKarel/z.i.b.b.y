import { describe, expect, it } from "vitest"
import { CACHE_TTL_MS, LimitsService, buildLimits } from "./limits.service"
import type { RateLimitSnapshot, RateLimitsReader } from "./rate-limits.reader"
import type { UsageFetcher } from "./usage-fetcher"

const snapshot = (over: Partial<RateLimitSnapshot> = {}): RateLimitSnapshot => ({
  rolling5hPct: 0,
  weekly7dPct: 0,
  rolling5hResetsAt: null,
  weekly7dResetsAt: null,
  capturedAt: null,
  stale: true,
  ...over,
})

describe("buildLimits", () => {
  it("shapes a fresh snapshot into the contract payload", () => {
    const limits = buildLimits(
      snapshot({
        rolling5hPct: 3,
        weekly7dPct: 8,
        rolling5hResetsAt: 1_780_833_600_000,
        weekly7dResetsAt: null,
        capturedAt: 1_780_000_000_000,
        stale: false,
      }),
    )
    expect(limits).toEqual({
      rolling: { usedPct: 3, resetsAt: 1_780_833_600_000 },
      weekly: { usedPct: 8, resetsAt: null },
      capturedAt: 1_780_000_000_000,
      stale: false,
    })
  })

  it("carries the stale flag and null capturedAt through", () => {
    const limits = buildLimits(snapshot({ capturedAt: null, stale: true }))
    expect(limits.stale).toBe(true)
    expect(limits.capturedAt).toBeNull()
  })
})

/** A LimitsService with a fixed clock and counting stub collaborators. */
function harness(opts: {
  fetched: RateLimitSnapshot | null
  fromFile?: RateLimitSnapshot
  now?: number
}) {
  let fetchCalls = 0
  let readCalls = 0
  const fetcher = {
    fetch: async () => {
      fetchCalls++
      return opts.fetched
    },
  } as unknown as UsageFetcher
  const reader = {
    read: async () => {
      readCalls++
      return opts.fromFile ?? snapshot()
    },
  } as unknown as RateLimitsReader

  let clock = opts.now ?? 1_000_000
  class TestLimitsService extends LimitsService {
    protected now(): number {
      return clock
    }
  }
  const service = new TestLimitsService(reader, fetcher)
  return {
    service,
    advance: (ms: number) => {
      clock += ms
    },
    get fetchCalls() {
      return fetchCalls
    },
    get readCalls() {
      return readCalls
    },
  }
}

describe("LimitsService.snapshot", () => {
  it("prefers the live Anthropic reading", async () => {
    const h = harness({ fetched: snapshot({ rolling5hPct: 12, weekly7dPct: 47, stale: false }) })
    const snap = await h.service.snapshot()
    expect(snap.rolling.usedPct).toBe(12)
    expect(snap.weekly.usedPct).toBe(47)
    expect(snap.stale).toBe(false)
    expect(h.readCalls).toBe(0)
  })

  it("falls back to the status-line capture when no live reading is available", async () => {
    const h = harness({
      fetched: null,
      fromFile: snapshot({ rolling5hPct: 5, weekly7dPct: 9, capturedAt: 999_000, stale: false }),
    })
    const snap = await h.service.snapshot()
    expect(snap.rolling.usedPct).toBe(5)
    expect(h.fetchCalls).toBe(1)
    expect(h.readCalls).toBe(1)
  })

  it("caches within the TTL, then re-fetches after it lapses", async () => {
    const h = harness({ fetched: snapshot({ rolling5hPct: 1, stale: false }) })
    await h.service.snapshot()
    await h.service.snapshot()
    expect(h.fetchCalls).toBe(1)

    h.advance(CACHE_TTL_MS + 1)
    await h.service.snapshot()
    expect(h.fetchCalls).toBe(2)
  })

  it("expires the cache no later than the earliest window reset", async () => {
    const now = 1_000_000
    // Reset is sooner than the TTL → cache must expire at the reset, not at now+TTL.
    const resetsAt = now + 60_000
    const h = harness({ fetched: snapshot({ rolling5hResetsAt: resetsAt, stale: false }), now })
    await h.service.snapshot()
    h.advance(60_001)
    await h.service.snapshot()
    expect(h.fetchCalls).toBe(2)
  })

  it("dedupes concurrent fetches into one in-flight call", async () => {
    const h = harness({ fetched: snapshot({ stale: false }) })
    await Promise.all([h.service.snapshot(), h.service.snapshot(), h.service.snapshot()])
    expect(h.fetchCalls).toBe(1)
  })

  it("noteLimitHit busts the cache so the next read re-fetches", async () => {
    const h = harness({ fetched: snapshot({ stale: false }) })
    await h.service.snapshot()
    expect(h.fetchCalls).toBe(1)
    h.service.noteLimitHit()
    await h.service.snapshot()
    expect(h.fetchCalls).toBe(2)
  })
})
