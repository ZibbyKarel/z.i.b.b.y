import { describe, expect, it } from "vitest"
import { matchesCron } from "./cron"

// A fixed instant: 2026-06-04T07:30:00Z. In Europe/Prague (CEST, +02:00) that is
// Thursday 09:30. Used to assert field matching without re-deriving wall time.
const AT_0930_PRAGUE = new Date("2026-06-04T07:30:00Z")

describe("matchesCron", () => {
  it("matches the wildcard every minute", () => {
    expect(matchesCron("* * * * *", AT_0930_PRAGUE)).toBe(true)
  })

  it("matches a specific minute + hour in Europe/Prague", () => {
    expect(matchesCron("30 9 * * *", AT_0930_PRAGUE)).toBe(true)
    expect(matchesCron("31 9 * * *", AT_0930_PRAGUE)).toBe(false)
    expect(matchesCron("30 8 * * *", AT_0930_PRAGUE)).toBe(false)
  })

  it("supports ranges, lists and steps", () => {
    expect(matchesCron("30 8-10 * * *", AT_0930_PRAGUE)).toBe(true)
    expect(matchesCron("0,30 9 * * *", AT_0930_PRAGUE)).toBe(true)
    expect(matchesCron("*/15 * * * *", AT_0930_PRAGUE)).toBe(true) // 30 % 15 === 0
    expect(matchesCron("*/7 * * * *", AT_0930_PRAGUE)).toBe(false) // 30 % 7 !== 0
  })

  it("matches day-of-week (Thursday = 4)", () => {
    expect(matchesCron("30 9 * * 4", AT_0930_PRAGUE)).toBe(true)
    expect(matchesCron("30 9 * * 1", AT_0930_PRAGUE)).toBe(false)
  })

  it("rejects a malformed expression", () => {
    expect(matchesCron("not a cron", AT_0930_PRAGUE)).toBe(false)
    expect(matchesCron("* * *", AT_0930_PRAGUE)).toBe(false)
  })
})
