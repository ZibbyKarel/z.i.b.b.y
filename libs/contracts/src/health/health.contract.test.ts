import { describe, expect, it } from "vitest"
import { HealthSchema, healthContract } from "../index"

describe("healthContract", () => {
  it("exposes a GET /api/health route returning 200", () => {
    expect(healthContract.getHealth.method).toBe("GET")
    expect(healthContract.getHealth.path).toBe("/api/health")
    expect(healthContract.getHealth.responses).toHaveProperty("200")
  })
})

describe("health schema", () => {
  it("accepts a well-formed ok payload with the claude preflight verdict", () => {
    const parsed = HealthSchema.safeParse({
      status: "ok",
      uptime: 12.3,
      timestamp: new Date().toISOString(),
      claude: { ok: true, version: "1.2.3 (Claude Code)" },
    })
    expect(parsed.success).toBe(true)
  })

  it("accepts a degraded payload carrying the failure reason", () => {
    const parsed = HealthSchema.safeParse({
      status: "degraded",
      uptime: 12.3,
      timestamp: new Date().toISOString(),
      claude: { ok: false, reason: "missing" },
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects an unknown status, a negative uptime, a non-ISO timestamp, or a missing claude", () => {
    const claude = { ok: true }
    expect(
      HealthSchema.safeParse({ status: "down", uptime: 1, timestamp: new Date().toISOString(), claude })
        .success,
    ).toBe(false)
    expect(
      HealthSchema.safeParse({ status: "ok", uptime: -1, timestamp: new Date().toISOString(), claude })
        .success,
    ).toBe(false)
    expect(
      HealthSchema.safeParse({ status: "ok", uptime: 1, timestamp: "not-a-date", claude }).success,
    ).toBe(false)
    expect(
      HealthSchema.safeParse({ status: "ok", uptime: 1, timestamp: new Date().toISOString() })
        .success,
    ).toBe(false)
  })
})
