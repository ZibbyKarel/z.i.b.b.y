import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

describe("Mandate API (e2e)", () => {
  let app: INestApplication
  let mandateFile: string

  beforeAll(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mandate-e2e-"))
    mandateFile = path.join(dir, "mandate.json")
    process.env.MANDATE_FILE = mandateFile
    process.env.CHANNEL_TICK_MS = "0"
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(path.dirname(mandateFile), { recursive: true, force: true })
    delete process.env.MANDATE_FILE
    delete process.env.CHANNEL_TICK_MS
  })

  it("GET returns the seeded conservative default (dispatch on, reply off)", async () => {
    const res = await request(app.getHttpServer()).get("/api/mandate").expect(200)
    expect(res.body.defaults).toEqual({ dispatch: true, reply: false })
    expect(res.body.channels).toEqual({})
  })

  it("PUT replaces the mandate and persists per-channel toggles", async () => {
    await request(app.getHttpServer())
      .put("/api/mandate")
      .send({ defaults: { dispatch: true, reply: false }, channels: { team: { reply: true } } })
      .expect(200)
    const res = await request(app.getHttpServer()).get("/api/mandate").expect(200)
    expect(res.body.channels.team.reply).toBe(true)
  })

  it("PUT rejects an unknown key with 422 (Law 4)", async () => {
    await request(app.getHttpServer())
      .put("/api/mandate")
      .send({ defaults: { dispatch: true, reply: false }, channels: {}, sneaky: true })
      .expect(422)
  })
})
