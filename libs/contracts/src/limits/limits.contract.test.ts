import { describe, expect, it } from "vitest"
import { LimitsSchema, limitsContract } from "../index"

describe("limitsContract", () => {
  it("exposes a GET /api/limits route returning 200", () => {
    expect(limitsContract.getLimits.method).toBe("GET")
    expect(limitsContract.getLimits.path).toBe("/api/limits")
    expect(limitsContract.getLimits.responses).toHaveProperty("200")
  })
})

describe("limits schema", () => {
  const ok = {
    rolling: { usedPct: 3 },
    weekly: { usedPct: 8 },
    capturedAt: 1_780_000_000_000,
    stale: false,
  }

  it("accepts a well-formed limits payload", () => {
    expect(LimitsSchema.safeParse(ok).success).toBe(true)
  })

  it("accepts a null capturedAt (never captured)", () => {
    expect(LimitsSchema.safeParse({ ...ok, capturedAt: null, stale: true }).success).toBe(true)
  })

  it("rejects an out-of-range percent or a missing freshness flag", () => {
    expect(LimitsSchema.safeParse({ ...ok, rolling: { usedPct: 120 } }).success).toBe(false)
    expect(LimitsSchema.safeParse({ ...ok, rolling: { usedPct: -1 } }).success).toBe(false)
    const noStale = { rolling: ok.rolling, weekly: ok.weekly, capturedAt: ok.capturedAt }
    expect(LimitsSchema.safeParse(noStale).success).toBe(false)
  })
})
