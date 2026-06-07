import { describe, expect, it } from "vitest"
import { type HeaderBag, parseUsageHeaders } from "./usage-fetcher"

/** Build a HeaderBag from a plain map (lowercased lookup like real `Headers`). */
const bag = (h: Record<string, string>): HeaderBag => ({
  get: (name) => h[name.toLowerCase()] ?? null,
})

describe("parseUsageHeaders", () => {
  const now = 1_780_000_000_000

  it("turns the unified rate-limit headers into a fresh snapshot", () => {
    const snap = parseUsageHeaders(
      bag({
        "anthropic-ratelimit-unified-5h-utilization": "0.01",
        "anthropic-ratelimit-unified-5h-reset": "1780833600",
        "anthropic-ratelimit-unified-7d-utilization": "0.41",
        "anthropic-ratelimit-unified-7d-reset": "1780862400",
      }),
      now,
    )
    expect(snap).toEqual({
      rolling5hPct: 1, // 0.01 * 100, rounded
      weekly7dPct: 41, // 0.41 * 100
      rolling5hResetsAt: 1_780_833_600_000, // seconds → ms
      weekly7dResetsAt: 1_780_862_400_000,
      capturedAt: now,
      stale: false,
    })
  })

  it("clamps a utilization above 1 to 100%", () => {
    const snap = parseUsageHeaders(
      bag({ "anthropic-ratelimit-unified-5h-utilization": "1.5" }),
      now,
    )
    expect(snap?.rolling5hPct).toBe(100)
  })

  it("leaves a window's reset null when the reset header is absent", () => {
    const snap = parseUsageHeaders(
      bag({ "anthropic-ratelimit-unified-7d-utilization": "0.2" }),
      now,
    )
    expect(snap?.weekly7dPct).toBe(20)
    expect(snap?.weekly7dResetsAt).toBeNull()
    expect(snap?.rolling5hResetsAt).toBeNull()
  })

  it("returns null when neither utilization header is present", () => {
    expect(parseUsageHeaders(bag({ "x-other": "1" }), now)).toBeNull()
  })

  it("returns null when the utilization headers are non-numeric", () => {
    expect(
      parseUsageHeaders(bag({ "anthropic-ratelimit-unified-5h-utilization": "n/a" }), now),
    ).toBeNull()
  })
})
