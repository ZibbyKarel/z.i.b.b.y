import { describe, expect, it } from "vitest"
import { DEFAULT_MANDATE, MandateSchema, mandateContract } from "../index"

describe("mandateContract", () => {
  it("exposes GET + PUT /api/mandate", () => {
    expect(mandateContract.getMandate.path).toBe("/api/mandate")
    expect(mandateContract.getMandate.method).toBe("GET")
    expect(mandateContract.setMandate.method).toBe("PUT")
  })
})

describe("MandateSchema (Law 4: strict, conservative default)", () => {
  it("defaults to dispatch on, reply off", () => {
    expect(DEFAULT_MANDATE).toEqual({ defaults: { dispatch: true, reply: false }, channels: {} })
  })

  it("accepts per-channel overrides", () => {
    expect(
      MandateSchema.safeParse({
        defaults: { dispatch: true, reply: false },
        channels: { team: { reply: true } },
      }).success,
    ).toBe(true)
  })

  it("rejects unknown keys at every level", () => {
    expect(
      MandateSchema.safeParse({ defaults: { dispatch: true, reply: false }, channels: {}, sneaky: 1 }).success,
    ).toBe(false)
    expect(
      MandateSchema.safeParse({ defaults: { dispatch: true, reply: false, x: 1 }, channels: {} }).success,
    ).toBe(false)
    expect(
      MandateSchema.safeParse({
        defaults: { dispatch: true, reply: false },
        channels: { team: { reply: true, evil: 1 } },
      }).success,
    ).toBe(false)
  })
})
