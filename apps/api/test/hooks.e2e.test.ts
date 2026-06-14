import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

describe("Hooks API (e2e)", () => {
  let app: INestApplication
  let hooksDir: string

  beforeAll(async () => {
    hooksDir = await fs.mkdtemp(path.join(os.tmpdir(), "hooks-e2e-"))
    process.env.HOOKS_DIR = hooksDir

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(hooksDir, { recursive: true, force: true })
    delete process.env.HOOKS_DIR
  })

  it("creates, lists, updates and deletes a hook", async () => {
    await request(app.getHttpServer())
      .post("/api/hooks")
      .send({ id: "notify-done", event: "Stop", command: "/usr/bin/notify done" })
      .expect(201)

    const list = await request(app.getHttpServer()).get("/api/hooks").expect(200)
    expect(list.body.some((h: { id: string }) => h.id === "notify-done")).toBe(true)

    await request(app.getHttpServer())
      .patch("/api/hooks/notify-done")
      .send({ enabled: false })
      .expect(200)
    const one = await request(app.getHttpServer()).get("/api/hooks/notify-done").expect(200)
    expect(one.body.enabled).toBe(false)

    await request(app.getHttpServer()).delete("/api/hooks/notify-done").expect(200)
    await request(app.getHttpServer()).get("/api/hooks/notify-done").expect(404)
  })

  it("409s on a duplicate id", async () => {
    await request(app.getHttpServer())
      .post("/api/hooks")
      .send({ id: "dupe", event: "PostToolUse", command: "echo hi" })
      .expect(201)
    await request(app.getHttpServer())
      .post("/api/hooks")
      .send({ id: "dupe", event: "PostToolUse", command: "echo hi" })
      .expect(409)
  })
})
