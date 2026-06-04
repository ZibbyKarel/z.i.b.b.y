import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function until<T>(fn: () => Promise<T>, timeoutMs = 8000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const result = await fn()
    if (result) return result
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out")
    await sleep(40)
  }
}

const markerExists = (cwd: string) =>
  fs
    .access(path.join(cwd, "agent-007-was-here.txt"))
    .then(() => true)
    .catch(() => false)

describe("Approval gate (e2e)", () => {
  let app: INestApplication
  let agentsDir: string
  let runsDir: string
  let approvalsDir: string

  async function boot(): Promise<INestApplication> {
    process.env.AGENTS_DIR = agentsDir
    process.env.AGENT_RUNS_DIR = runsDir
    process.env.APPROVALS_DIR = approvalsDir
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "appr-agents-"))
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "appr-runs-"))
    approvalsDir = await fs.mkdtemp(path.join(os.tmpdir(), "appr-store-"))
    process.env.AGENT_DEMO_STEPS = "3"
    process.env.AGENT_DEMO_DELAY_MS = "40"
    app = await boot()

    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "agent-007", name: "Agent 007", instructions: "gated", requires_approval: true, risk: "high" })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
    for (const d of [agentsDir, runsDir, approvalsDir]) await fs.rm(d, { recursive: true, force: true })
    for (const k of ["AGENTS_DIR", "AGENT_RUNS_DIR", "APPROVALS_DIR", "AGENT_DEMO_STEPS", "AGENT_DEMO_DELAY_MS"]) {
      delete process.env[k]
    }
  })

  it("pauses a gated run at awaiting-approval with NO external effect, then resumes on approve", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/agents/agent-007/run")
      .send({ prompt: "do the thing", project: "zibby-core" })
      .expect(201)
    const { runId, cwd, status } = start.body
    expect(status).toBe("awaiting-approval")

    // The gated action has NOT run: no marker file, the demo task never spawned.
    expect(await markerExists(cwd)).toBe(false)

    // A pending approval exists, linked to the run.
    const pending = await request(app.getHttpServer())
      .get("/api/approvals")
      .query({ status: "pending" })
      .expect(200)
    const approval = pending.body.find((a: { runId: string }) => a.runId === runId)
    expect(approval).toBeTruthy()
    expect(approval.risk).toBe("high")

    // Approve → the run resumes and finishes, performing the action.
    await request(app.getHttpServer()).post(`/api/approvals/${approval.id}/approve`).send({}).expect(200)

    const final = await until(async () => {
      const res = await request(app.getHttpServer()).get(`/api/agents/runs/${runId}`).expect(200)
      return res.body.status === "done" ? res.body : null
    })
    expect(final.status).toBe("done")
    expect(await markerExists(cwd)).toBe(true)
  })

  it("rejecting a gated run terminates it without performing the action", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/agents/agent-007/run")
      .send({ prompt: "nope", project: "zibby-core" })
      .expect(201)
    const { runId, cwd } = start.body

    const pending = await request(app.getHttpServer()).get("/api/approvals").query({ status: "pending" })
    const approval = pending.body.find((a: { runId: string }) => a.runId === runId)
    await request(app.getHttpServer()).post(`/api/approvals/${approval.id}/reject`).send({}).expect(200)

    const run = await request(app.getHttpServer()).get(`/api/agents/runs/${runId}`).expect(200)
    expect(run.body.status).toBe("interrupted")
    expect(await markerExists(cwd)).toBe(false)

    // Deciding again is a 409.
    await request(app.getHttpServer()).post(`/api/approvals/${approval.id}/reject`).send({}).expect(409)
  })
})

describe("Approval gate persistence across restart (e2e)", () => {
  let agentsDir: string
  let runsDir: string
  let approvalsDir: string

  async function boot(): Promise<INestApplication> {
    process.env.AGENTS_DIR = agentsDir
    process.env.AGENT_RUNS_DIR = runsDir
    process.env.APPROVALS_DIR = approvalsDir
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeEach(async () => {
    agentsDir ??= await fs.mkdtemp(path.join(os.tmpdir(), "appr2-agents-"))
    runsDir ??= await fs.mkdtemp(path.join(os.tmpdir(), "appr2-runs-"))
    approvalsDir ??= await fs.mkdtemp(path.join(os.tmpdir(), "appr2-store-"))
  })

  afterAll(async () => {
    for (const d of [agentsDir, runsDir, approvalsDir]) await fs.rm(d, { recursive: true, force: true })
    for (const k of ["AGENTS_DIR", "AGENT_RUNS_DIR", "APPROVALS_DIR", "AGENT_DEMO_STEPS", "AGENT_DEMO_DELAY_MS"]) {
      delete process.env[k]
    }
  })

  it("an awaiting-approval run and its pending approval both survive a restart", async () => {
    process.env.AGENT_DEMO_STEPS = "3"
    process.env.AGENT_DEMO_DELAY_MS = "40"
    const app1 = await boot()
    await request(app1.getHttpServer())
      .post("/api/agents")
      .send({ id: "agent-007", name: "Agent 007", instructions: "gated", requires_approval: true })
      .expect(201)
    const start = await request(app1.getHttpServer())
      .post("/api/agents/agent-007/run")
      .send({ prompt: "later", project: "zibby-core" })
      .expect(201)
    const { runId } = start.body
    await app1.close()

    // Restart: a fresh app over the same dirs.
    const app2 = await boot()
    const run = await request(app2.getHttpServer()).get(`/api/agents/runs/${runId}`).expect(200)
    expect(run.body.status).toBe("awaiting-approval")

    const pending = await request(app2.getHttpServer()).get("/api/approvals").query({ status: "pending" }).expect(200)
    const approval = pending.body.find((a: { runId: string }) => a.runId === runId)
    expect(approval).toBeTruthy()

    // It can still be approved after the restart (the spawn spec was persisted).
    await request(app2.getHttpServer()).post(`/api/approvals/${approval.id}/approve`).send({}).expect(200)
    const final = await until(async () => {
      const res = await request(app2.getHttpServer()).get(`/api/agents/runs/${runId}`)
      return res.body.status === "done" ? res.body : null
    })
    expect(final.status).toBe("done")
    await app2.close()
  })
})
