import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

describe("Health API (e2e)", () => {
  let app: INestApplication
  let dir: string

  beforeAll(async () => {
    // AppModule seeds the agents data dir on init; isolate it so this suite never
    // touches the real `apps/api/data/agents`.
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "health-e2e-"))
    process.env.AGENTS_DIR = dir

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(dir, { recursive: true, force: true })
    delete process.env.AGENTS_DIR
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
