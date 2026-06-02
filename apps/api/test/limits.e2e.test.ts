import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { LimitsSchema } from "@zibby/contracts"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

describe("Limits API (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("returns both interactive windows matching the contract", async () => {
    const res = await request(app.getHttpServer()).get("/api/limits")
    expect(res.status).toBe(200)
    expect(LimitsSchema.safeParse(res.body).success).toBe(true)
  })

  it("reports each window utilization within bounds", async () => {
    const res = await request(app.getHttpServer()).get("/api/limits")
    // The real reading is captured from the local status line, so the magnitude
    // varies by machine (and is absent on CI); only the invariants must hold.
    for (const window of [res.body.rolling, res.body.weekly]) {
      expect(window.usedPct).toBeGreaterThanOrEqual(0)
      expect(window.usedPct).toBeLessThanOrEqual(100)
    }
    expect(typeof res.body.stale).toBe("boolean")
    expect(res.body.capturedAt === null || typeof res.body.capturedAt === "number").toBe(true)
  })
})
