import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll `fn` until it returns a truthy value or the timeout elapses. */
async function until<T>(fn: () => Promise<T>, timeoutMs = 8000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const result = await fn()
    if (result) return result
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out")
    await sleep(50)
  }
}

describe("Agent runs API (e2e)", () => {
  let app: INestApplication
  let agentsDir: string
  let runsDir: string

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "runs-e2e-agents-"))
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "runs-e2e-runs-"))
    process.env.AGENTS_DIR = agentsDir
    process.env.AGENT_RUNS_DIR = runsDir
    // Keep the demo task fast for CI.
    process.env.AGENT_DEMO_STEPS = "3"
    process.env.AGENT_DEMO_DELAY_MS = "60"

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    // Seed the agent we run.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "agent-007", name: "Agent 007", instructions: "test agent" })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(agentsDir, { recursive: true, force: true })
    await fs.rm(runsDir, { recursive: true, force: true })
    delete process.env.AGENTS_DIR
    delete process.env.AGENT_RUNS_DIR
    delete process.env.AGENT_DEMO_STEPS
    delete process.env.AGENT_DEMO_DELAY_MS
  })

  it("runs an agent end to end: start → running → logs → finishes, leaving a marker + durable log", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/agents/agent-007/run")
      .send({ prompt: "do the thing", project: "zibby-core" })
      .expect(201)

    const { runId, agentId, status, pid, cwd, logFile } = start.body
    expect(agentId).toBe("agent-007")
    expect(status).toBe("running")
    expect(runId).toBe(`agent-007_${runId.split("_")[1]}_${pid}`)

    // It shows up in the running list.
    const running = await request(app.getHttpServer()).get("/api/agents/running").expect(200)
    expect(Array.isArray(running.body)).toBe(true)
    expect(running.body.some((r: { runId: string }) => r.runId === runId)).toBe(true)

    // Tail the log by offset until the run reports done.
    let offset = 0
    let log = ""
    const final = await until(async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/agents/runs/${runId}/logs`)
        .query({ offset })
        .expect(200)
      log += res.body.content
      expect(res.body.nextOffset).toBeGreaterThanOrEqual(offset)
      offset = res.body.nextOffset
      return res.body.done ? res.body : null
    })

    expect(final.done).toBe(true)
    expect(log).toContain("PROGRESS 100")

    // The "simple task": a marker file in the sandbox folder.
    const marker = await fs.readFile(path.join(cwd, "agent-007-was-here.txt"), "utf8")
    expect(marker).toContain("Agent 007 ran at")

    // The log file persists on disk (survives a frontend reload).
    const onDisk = await fs.readFile(logFile, "utf8")
    expect(onDisk).toContain("PROGRESS 100")
    expect(path.dirname(logFile)).toBe(path.resolve(runsDir))
  })

  it("stops a running agent", async () => {
    process.env.AGENT_DEMO_STEPS = "50"
    process.env.AGENT_DEMO_DELAY_MS = "100"
    const start = await request(app.getHttpServer())
      .post("/api/agents/agent-007/run")
      .send({ prompt: "long one", project: "zibby-core" })
      .expect(201)
    process.env.AGENT_DEMO_STEPS = "3"
    process.env.AGENT_DEMO_DELAY_MS = "60"

    const { runId } = start.body
    const stopped = await request(app.getHttpServer())
      .post(`/api/agents/runs/${runId}/stop`)
      .send({})
      .expect(200)
    expect(stopped.body.runId).toBe(runId)
  })

  it("404s for an unknown agent or run", async () => {
    await request(app.getHttpServer())
      .post("/api/agents/no-such-agent/run")
      .send({ prompt: "x" })
      .expect(404)

    await request(app.getHttpServer())
      .get("/api/agents/runs/not-a-real-run/logs")
      .query({ offset: 0 })
      .expect(404)
  })

  it("treats GET /api/agents/running as the run list, not an agent lookup", async () => {
    // Guard the route-ordering trick: `running` must not be captured by `:id`.
    const res = await request(app.getHttpServer()).get("/api/agents/running").expect(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe("Agent runs persistence across restart (e2e)", () => {
  let agentsDir: string
  let runsDir: string

  async function bootApp(): Promise<INestApplication> {
    process.env.AGENTS_DIR = agentsDir
    process.env.AGENT_RUNS_DIR = runsDir
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "restart-e2e-agents-"))
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "restart-e2e-runs-"))
    process.env.AGENT_DEMO_STEPS = "3"
    process.env.AGENT_DEMO_DELAY_MS = "60"

    const seed = await bootApp()
    await request(seed.getHttpServer())
      .post("/api/agents")
      .send({ id: "agent-007", name: "Agent 007", instructions: "test agent" })
      .expect(201)
    await seed.close()
  })

  afterAll(async () => {
    await fs.rm(agentsDir, { recursive: true, force: true })
    await fs.rm(runsDir, { recursive: true, force: true })
    delete process.env.AGENTS_DIR
    delete process.env.AGENT_RUNS_DIR
    delete process.env.AGENT_DEMO_STEPS
    delete process.env.AGENT_DEMO_DELAY_MS
  })

  it("a completed run reappears in the list after a backend restart", async () => {
    const app1 = await bootApp()
    const start = await request(app1.getHttpServer())
      .post("/api/agents/agent-007/run")
      .send({ prompt: "persist me", project: "zibby-core" })
      .expect(201)
    const { runId } = start.body
    await until(async () => {
      const res = await request(app1.getHttpServer())
        .get(`/api/agents/runs/${runId}/logs`)
        .query({ offset: 0 })
      return res.body.done ? res.body : null
    })
    await app1.close()

    // Restart: a brand-new app over the same RUNS_DIR rebuilds from disk.
    const app2 = await bootApp()
    const running = await request(app2.getHttpServer()).get("/api/agents/running").expect(200)
    const found = running.body.find((r: { runId: string }) => r.runId === runId)
    expect(found).toBeTruthy()
    expect(found.status).toBe("done")
    expect(found.prompt).toBe("persist me")
    expect(found.project).toBe("zibby-core")
    await app2.close()
  })

  it("reconciles a run left 'running' at crash to 'interrupted'", async () => {
    // Simulate a hard crash: a dangling sidecar (+ log) the runner never finalized.
    const runId = "ghost_1780000000000_4242"
    const logFile = path.join(runsDir, `${runId}.log`)
    await fs.writeFile(logFile, "starting up\nPROGRESS 40\n", "utf8")
    await fs.writeFile(
      path.join(runsDir, `${runId}.json`),
      JSON.stringify({
        runId,
        agentId: "agent-007",
        status: "running",
        pct: 40,
        prompt: "ghost run",
        project: "home-ops",
        cwd: path.join(runsDir, "ghost"),
        startedAt: new Date().toISOString(),
        pid: 4242,
        logFile,
      }),
      "utf8",
    )

    const app = await bootApp()
    const running = await request(app.getHttpServer()).get("/api/agents/running").expect(200)
    const found = running.body.find((r: { runId: string }) => r.runId === runId)
    expect(found?.status).toBe("interrupted")
    expect(found?.pct).toBe(40)
    await app.close()
  })
})
