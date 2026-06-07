import { afterEach, describe, expect, it } from "vitest"
import { STALE_AFTER_MS, claudeConfigDir, parseRateLimits } from "./rate-limits.reader"

describe("claudeConfigDir", () => {
  const original = process.env.CLAUDE_CONFIG_DIR
  afterEach(() => {
    if (original === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = original
  })

  it("honors CLAUDE_CONFIG_DIR when set", () => {
    process.env.CLAUDE_CONFIG_DIR = "/tmp/custom-claude"
    expect(claudeConfigDir()).toBe("/tmp/custom-claude")
  })

  it("falls back to ~/.claude when unset", () => {
    delete process.env.CLAUDE_CONFIG_DIR
    expect(claudeConfigDir()).toMatch(/[/\\]\.claude$/)
  })
})

describe("parseRateLimits", () => {
  const now = 1_780_000_000_000
  const capture = (overrides: object): string =>
    JSON.stringify({
      rateLimits: { five_hour: { used_percentage: 3 }, seven_day: { used_percentage: 8 } },
      capturedAt: now,
      ...overrides,
    })

  it("reads the 5h and weekly utilization from a fresh capture", () => {
    expect(parseRateLimits(capture({}), now)).toEqual({
      rolling5hPct: 3,
      weekly7dPct: 8,
      rolling5hResetsAt: null,
      weekly7dResetsAt: null,
      capturedAt: now,
      stale: false,
    })
  })

  it("reads resets_at (epoch seconds) into epoch-ms reset times", () => {
    const raw = JSON.stringify({
      rateLimits: {
        five_hour: { used_percentage: 3, resets_at: 1_780_833_600 },
        seven_day: { used_percentage: 8, resets_at: 1_780_862_400 },
      },
      capturedAt: now,
    })
    const snap = parseRateLimits(raw, now)
    expect(snap.rolling5hResetsAt).toBe(1_780_833_600_000)
    expect(snap.weekly7dResetsAt).toBe(1_780_862_400_000)
  })

  it("rounds and clamps out-of-range percentages", () => {
    const raw = JSON.stringify({
      rateLimits: { five_hour: { used_percentage: 2.6 }, seven_day: { used_percentage: 140 } },
      capturedAt: now,
    })
    const snap = parseRateLimits(raw, now)
    expect(snap.rolling5hPct).toBe(3)
    expect(snap.weekly7dPct).toBe(100)
  })

  it("flags a capture older than the freshness window as stale", () => {
    const snap = parseRateLimits(capture({ capturedAt: now - STALE_AFTER_MS - 1 }), now)
    expect(snap.stale).toBe(true)
    expect(snap.rolling5hPct).toBe(3) // last-known value still reported
  })

  it("treats a missing rate_limits block as unknown (stale)", () => {
    const snap = parseRateLimits(JSON.stringify({ rateLimits: null, capturedAt: now }), now)
    expect(snap).toEqual({
      rolling5hPct: 0,
      weekly7dPct: 0,
      rolling5hResetsAt: null,
      weekly7dResetsAt: null,
      capturedAt: now,
      stale: true,
    })
  })

  it("degrades malformed JSON to unknown rather than throwing", () => {
    expect(parseRateLimits("not json", now)).toEqual({
      rolling5hPct: 0,
      weekly7dPct: 0,
      rolling5hResetsAt: null,
      weekly7dResetsAt: null,
      capturedAt: null,
      stale: true,
    })
  })
})
