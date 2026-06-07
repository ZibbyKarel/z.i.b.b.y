import { describe, expect, it } from "vitest"
import { detectLimit } from "./detect-limit"

describe("detectLimit", () => {
  it("extracts the reset epoch from Claude Code's limit message", () => {
    const out = detectLimit("Claude usage limit reached | 1780833600")
    expect(out.hit).toBe(true)
    expect(out.resetsAt).toBe(1_780_833_600_000) // seconds → ms
  })

  it("matches the 'Claude AI usage limit reached' variant", () => {
    expect(detectLimit("Claude AI usage limit reached").hit).toBe(true)
  })

  it("flags the limit message without a reset as a hit with null resetsAt", () => {
    const out = detectLimit("Claude usage limit reached. Try again later.")
    expect(out.hit).toBe(true)
    expect(out.resetsAt).toBeNull()
  })

  it("matches generic rate-limit phrasing", () => {
    expect(detectLimit("Error: rate limited, slow down").hit).toBe(true)
    expect(detectLimit("429 Too Many Requests").hit).toBe(true)
  })

  it("matches a bare HTTP 429", () => {
    expect(detectLimit("server returned HTTP 429").hit).toBe(true)
  })

  it("does not flag ordinary output", () => {
    expect(detectLimit("PROGRESS 42\nstill working...")).toEqual({ hit: false, resetsAt: null })
  })

  it("does not treat an unrelated number like 4291 as a 429", () => {
    expect(detectLimit("processed 4291 rows").hit).toBe(false)
  })
})
