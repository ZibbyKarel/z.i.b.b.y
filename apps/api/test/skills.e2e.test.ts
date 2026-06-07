import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

describe("Skills API (e2e)", () => {
  let app: INestApplication
  let skillsDir: string

  beforeAll(async () => {
    skillsDir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-e2e-"))
    process.env.SKILLS_DIR = skillsDir

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(skillsDir, { recursive: true, force: true })
    delete process.env.SKILLS_DIR
  })

  it("creates, lists and fetches a skill", async () => {
    await request(app.getHttpServer())
      .post("/api/skills")
      .send({ id: "summarize", glyph: "spark", desc: "TL;DR", instructions: "Be concise." })
      .expect(201)

    const list = await request(app.getHttpServer()).get("/api/skills").expect(200)
    expect(list.body.some((s: { id: string }) => s.id === "summarize")).toBe(true)

    const one = await request(app.getHttpServer()).get("/api/skills/summarize").expect(200)
    expect(one.body.instructions).toBe("Be concise.")
  })

  it("404s for an unknown skill", async () => {
    await request(app.getHttpServer()).get("/api/skills/no-such-skill").expect(404)
  })
})
