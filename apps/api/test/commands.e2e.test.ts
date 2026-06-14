import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

describe("Commands API (e2e)", () => {
  let app: INestApplication
  let commandsDir: string

  beforeAll(async () => {
    commandsDir = await fs.mkdtemp(path.join(os.tmpdir(), "commands-e2e-"))
    process.env.COMMANDS_DIR = commandsDir
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(commandsDir, { recursive: true, force: true })
    delete process.env.COMMANDS_DIR
  })

  it("creates, lists, updates and deletes a command", async () => {
    await request(app.getHttpServer())
      .post("/api/commands")
      .send({ id: "orchestrate", description: "Run chains", instructions: "Orchestrate: $ARGUMENTS" })
      .expect(201)

    const list = await request(app.getHttpServer()).get("/api/commands").expect(200)
    expect(list.body.some((c: { id: string }) => c.id === "orchestrate")).toBe(true)

    await request(app.getHttpServer())
      .patch("/api/commands/orchestrate")
      .send({ enabled: false })
      .expect(200)
    const one = await request(app.getHttpServer()).get("/api/commands/orchestrate").expect(200)
    expect(one.body.enabled).toBe(false)

    await request(app.getHttpServer()).delete("/api/commands/orchestrate").expect(200)
    await request(app.getHttpServer()).get("/api/commands/orchestrate").expect(404)
  })

  it("409s on a duplicate id", async () => {
    await request(app.getHttpServer())
      .post("/api/commands")
      .send({ id: "dupe", instructions: "x" })
      .expect(201)
    await request(app.getHttpServer())
      .post("/api/commands")
      .send({ id: "dupe", instructions: "x" })
      .expect(409)
  })
})
