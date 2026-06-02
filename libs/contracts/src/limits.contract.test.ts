import { describe, expect, it } from "vitest"
import { LimitsSchema, limitsContract } from "./index"

describe("limitsContract", () => {
  it("exposes a GET /api/limits route returning 200", () => {
    expect(limitsContract.getLimits.method).toBe("GET")
    expect(limitsContract.getLimits.path).toBe("/api/limits")
    expect(limitsContract.getLimits.responses).toHaveProperty("200")
  })
})

describe("limits schema", () => {
  const window = { usedTokens: 0, limitTokens: 200_000, usedPct: 0 }
  const ok = {
    rolling: window,
    weekly: { usedTokens: 1_885_280, limitTokens: 5_000_000, usedPct: 38 },
  }

  it("accepts a well-formed limits payload", () => {
    expect(LimitsSchema.safeParse(ok).success).toBe(true)
  })

  it("rejects a negative used count, a fractional token count, or an out-of-range percent", () => {
    expect(LimitsSchema.safeParse({ ...ok, rolling: { ...window, usedTokens: -1 } }).success).toBe(
      false,
    )
    expect(LimitsSchema.safeParse({ ...ok, rolling: { ...window, usedTokens: 1.5 } }).success).toBe(
      false,
    )
    expect(LimitsSchema.safeParse({ ...ok, rolling: { ...window, usedPct: 120 } }).success).toBe(
      false,
    )
  })
})
