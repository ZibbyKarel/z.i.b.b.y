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

  it("derives usedPct consistently from the windowed token totals", async () => {
    const res = await request(app.getHttpServer()).get("/api/limits")
    for (const window of [res.body.rolling, res.body.weekly]) {
      // Real usage is read from local transcripts, so the magnitude varies by
      // machine; the invariants (caps, bounds, derivation) must always hold.
      expect(window.limitTokens).toBeGreaterThan(0)
      expect(window.usedTokens).toBeGreaterThanOrEqual(0)
      expect(window.usedPct).toBeGreaterThanOrEqual(0)
      expect(window.usedPct).toBeLessThanOrEqual(100)
      const expected = Math.min(100, Math.round((window.usedTokens / window.limitTokens) * 100))
      expect(window.usedPct).toBe(expected)
    }
  })
})
