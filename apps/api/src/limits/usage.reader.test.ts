import { describe, expect, it } from "vitest"
import { type UsageEvent, sumWindows } from "./usage.reader"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe("sumWindows", () => {
  const now = Date.parse("2026-06-02T12:00:00.000Z")
  const at = (ms: number): number => now - ms

  const events: UsageEvent[] = [
    { at: at(1 * HOUR), tokens: 100 }, // in 5h + 7d
    { at: at(4 * HOUR), tokens: 50 }, //  in 5h + 7d
    { at: at(6 * HOUR), tokens: 30 }, //  in 7d only
    { at: at(3 * DAY), tokens: 200 }, //  in 7d only
    { at: at(10 * DAY), tokens: 999 }, // outside both
  ]

  it("buckets events into the rolling 5h and weekly 7d windows", () => {
    expect(sumWindows(events, now)).toEqual({ rolling5hTokens: 150, weekly7dTokens: 380 })
  })

  it("returns zeros for no events", () => {
    expect(sumWindows([], now)).toEqual({ rolling5hTokens: 0, weekly7dTokens: 0 })
  })

  it("counts an event exactly on the 5h boundary as inside the window", () => {
    expect(sumWindows([{ at: at(5 * HOUR), tokens: 7 }], now).rolling5hTokens).toBe(7)
  })
})
