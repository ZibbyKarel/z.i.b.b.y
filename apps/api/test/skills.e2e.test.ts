import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function until<T>(fn: () => Promise<T>, timeoutMs = 8000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const result = await fn()
    if (result) return result
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out")
    await sleep(50)
  }
}

describe("Skills API (e2e)", () => {
  let app: INestApplication
  let skillsDir: string
  let runsDir: string

  beforeAll(async () => {
    skillsDir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-e2e-"))
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-runs-e2e-"))
    process.env.SKILLS_DIR = skillsDir
    process.env.SKILL_RUNS_DIR = runsDir
    process.env.AGENT_DEMO_STEPS = "3"
    process.env.AGENT_DEMO_DELAY_MS = "60"

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(skillsDir, { recursive: true, force: true })
    await fs.rm(runsDir, { recursive: true, force: true })
    delete process.env.SKILLS_DIR
    delete process.env.SKILL_RUNS_DIR
    delete process.env.AGENT_DEMO_STEPS
    delete process.env.AGENT_DEMO_DELAY_MS
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

  it("runs a skill end to end via the shared runner", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/skills/summarize/run")
      .send({ prompt: "go", project: "zibby-core" })
      .expect(201)
    const { runId, skillId, status } = start.body
    expect(skillId).toBe("summarize")
    expect(status).toBe("running")

    let offset = 0
    let log = ""
    const final = await until(async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/skills/runs/${runId}/logs`)
        .query({ offset })
        .expect(200)
      log += res.body.content
      offset = res.body.nextOffset
      return res.body.done ? res.body : null
    })
    expect(final.done).toBe(true)
    expect(log).toContain("PROGRESS 100")
  })

  it("treats GET /api/skills/running as the run list, not a skill lookup", async () => {
    const res = await request(app.getHttpServer()).get("/api/skills/running").expect(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("404s for an unknown skill or run", async () => {
    await request(app.getHttpServer())
      .post("/api/skills/no-such-skill/run")
      .send({ prompt: "x" })
      .expect(404)
    await request(app.getHttpServer())
      .get("/api/skills/runs/not-a-real-run/logs")
      .query({ offset: 0 })
      .expect(404)
  })
})
