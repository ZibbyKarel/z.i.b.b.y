import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

describe("Health API (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("reports the API is up with uptime and an ISO timestamp", async () => {
    const res = await request(app.getHttpServer()).get("/api/health")
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("ok")
    expect(typeof res.body.uptime).toBe("number")
    expect(res.body.uptime).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false)
  })
})
