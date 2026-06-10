import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

const CLASSIFY = "/api/tasks/classify"

/**
 * Under the test runner the `claude -p` router self-disables (same guard as the
 * usage fetcher), so every request deterministically exercises the keyword-scorer
 * fallback — no live LLM, no quota burn.
 */
describe("Tasks API (e2e)", () => {
  let app: INestApplication
  let agentsDir: string
  let pipelinesDir: string

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "tasks-agents-e2e-"))
    pipelinesDir = await fs.mkdtemp(path.join(os.tmpdir(), "tasks-pipelines-e2e-"))
    process.env.AGENTS_DIR = agentsDir
    process.env.PIPELINES_DIR = pipelinesDir

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterEach(async () => {
    for (const dir of [agentsDir, pipelinesDir]) {
      for (const entry of await fs.readdir(dir)) {
        await fs.rm(path.join(dir, entry), { force: true })
      }
    }
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(agentsDir, { recursive: true, force: true })
    await fs.rm(pipelinesDir, { recursive: true, force: true })
    delete process.env.AGENTS_DIR
    delete process.env.PIPELINES_DIR
  })

  const seedCatalog = async () => {
    await request(app.getHttpServer()).post("/api/agents").send({
      id: "curator",
      name: "Kurátor",
      category: "Média",
      description: "Třídí a popisuje média v knihovně",
      instructions: "Spravuj média.",
    })
    await request(app.getHttpServer()).post("/api/agents").send({
      id: "coder",
      name: "Kodér",
      category: "Vývoj",
      description: "Implementuje funkce podle zadání",
      instructions: "Piš kód.",
    })
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "build-feature",
        name: "Build Feature",
        desc: "Spec, implementace, testy a docs",
        phases: [
          {
            id: "spec",
            agent: "coder",
            consumes: "task",
            produces: "design",
            model: "sonnet",
            thinking: "medium",
          },
        ],
        instructions: "Postav feature.",
      })
  }

  it("routes a matching task to the right agent with confidence and candidates", async () => {
    await seedCatalog()
    const res = await request(app.getHttpServer())
      .post(CLASSIFY)
      .send({ text: "Srovnej a popiš média v mé knihovně" })

    expect(res.status).toBe(200)
    expect(res.body.target.id).toBe("curator")
    expect(res.body.matchedTerms.length).toBeGreaterThan(0)
    expect(res.body.confidence).toBeGreaterThan(0.4)
    // Every stored target is offered for manual override (2 agents + 1 pipeline).
    expect(res.body.candidates).toHaveLength(3)
    expect(res.body.candidates.some((c: { kind: string }) => c.kind === "pipeline")).toBe(true)
  })

  it("still returns a low-confidence target when nothing matches", async () => {
    await seedCatalog()
    const res = await request(app.getHttpServer())
      .post(CLASSIFY)
      .send({ text: "qqq zzz xyzzy" })

    expect(res.status).toBe(200)
    expect(res.body.confidence).toBeLessThan(0.4)
    expect(res.body.target).toBeDefined()
  })

  it("returns 422 when the catalog is empty", async () => {
    const res = await request(app.getHttpServer())
      .post(CLASSIFY)
      .send({ text: "do something" })

    expect(res.status).toBe(422)
  })

  it("rejects an empty task body (contract validation)", async () => {
    const res = await request(app.getHttpServer()).post(CLASSIFY).send({ text: "" })
    expect(res.status).toBe(400)
  })
})
