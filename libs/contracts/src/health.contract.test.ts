import { describe, expect, it } from "vitest"
import { HealthSchema, healthContract } from "./index"

describe("healthContract", () => {
  it("exposes a GET /api/health route returning 200", () => {
    expect(healthContract.getHealth.method).toBe("GET")
    expect(healthContract.getHealth.path).toBe("/api/health")
    expect(healthContract.getHealth.responses).toHaveProperty("200")
  })
})

describe("health schema", () => {
  it("accepts a well-formed health payload", () => {
    const parsed = HealthSchema.safeParse({
      status: "ok",
      uptime: 12.3,
      timestamp: new Date().toISOString(),
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects a non-ok status, a negative uptime, or a non-ISO timestamp", () => {
    expect(
      HealthSchema.safeParse({ status: "down", uptime: 1, timestamp: new Date().toISOString() })
        .success,
    ).toBe(false)
    expect(
      HealthSchema.safeParse({ status: "ok", uptime: -1, timestamp: new Date().toISOString() })
        .success,
    ).toBe(false)
    expect(
      HealthSchema.safeParse({ status: "ok", uptime: 1, timestamp: "not-a-date" }).success,
    ).toBe(false)
  })
})
