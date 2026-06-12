import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"
import { LimitResumeService } from "../src/limits-resume/limit-resume.service"
import { LimitsService } from "../src/limits/limits.service"

/** Token-free `claude` stand-in so agent-run dispatch passes preflight (demo path). */
const FAKE_CLAUDE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/fake-claude.mjs")

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 12000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const result = await fn()
    if (result) return result
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out")
    await sleep(40)
  }
}

const phase = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  agent: "writer",
  consumes: `${id}.in`,
  produces: `${id}.out`,
  model: "sonnet",
  thinking: "medium",
  ...extra,
})

/**
 * Write the status-line capture the RateLimitsReader resolves under a temp
 * `CLAUDE_CONFIG_DIR` (UsageFetcher self-disables under VITEST, so this fixture is
 * the sole source of the limits snapshot). `usedPct` 100 = exhausted, low = headroom.
 */
async function writeLimits(configDir: string, usedPct: number, resetsAtSec: number): Promise<void> {
  const body = {
    rateLimits: {
      five_hour: { used_percentage: usedPct, resets_at: resetsAtSec },
      seven_day: { used_percentage: usedPct, resets_at: resetsAtSec },
    },
    capturedAt: Date.now(),
  }
  await fs.writeFile(path.join(configDir, "rate-limits.json"), JSON.stringify(body), "utf8")
}

describe("Usage-limit pause / auto-resume (e2e)", () => {
  let app: INestApplication
  let configDir: string
  const dirs: Record<string, string> = {}

  async function boot(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeAll(async () => {
    for (const k of ["pipelines", "runs", "projects", "vault", "tasks", "agents"]) {
      dirs[k] = await fs.mkdtemp(path.join(os.tmpdir(), `limit-${k}-`))
    }
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), "limit-config-"))
    // Pin demo mode: the repo's local .env forces AGENT_RUNNER_MODE=claude, which would
    // make stages spawn real `claude` (preflight 503 here / token burn). dotenv does not
    // override an already-set var, so this wins. Stages run via the token-free demo path.
    process.env.AGENT_RUNNER_MODE = "demo"
    process.env.CLAUDE_CONFIG_DIR = configDir
    process.env.PIPELINES_DIR = dirs.pipelines
    process.env.PIPELINE_RUNS_DIR = dirs.runs
    process.env.PROJECTS_DIR = dirs.projects
    process.env.VAULT_DIR = dirs.vault
    process.env.TASKS_DIR = dirs.tasks
    process.env.AGENTS_DIR = dirs.agents
    // Agent runs (task dispatch) are always claude-shaped and preflight; point them at
    // the fake CLI so a dispatch succeeds without a real session (pipeline stages stay
    // on the demo path via AGENT_RUNNER_MODE=demo).
    process.env.CLAUDE_BIN = FAKE_CLAUDE
    process.env.FAKE_CLAUDE_STEPS = "1"
    process.env.FAKE_CLAUDE_DELAY_MS = "10"
    process.env.AGENT_DEMO_STEPS = "1"
    process.env.AGENT_DEMO_DELAY_MS = "10"
    process.env.TASK_TICK_MS = "0"
    process.env.LIMIT_RESUME_TICK_MS = "0" // drive the scan manually
    process.env.LIMIT_RESUME_MAX = "3"
    // Start with plenty of headroom so the phase-boundary guard never pauses; only the
    // demo limit line (mid-stage) does.
    await writeLimits(configDir, 5, Math.floor(Date.now() / 1000) + 3600)
    app = await boot()
  })

  afterAll(async () => {
    await app.close()
    for (const d of Object.values(dirs)) await fs.rm(d, { recursive: true, force: true })
    await fs.rm(configDir, { recursive: true, force: true })
    for (const k of [
      "AGENT_RUNNER_MODE", "CLAUDE_BIN", "FAKE_CLAUDE_STEPS", "FAKE_CLAUDE_DELAY_MS",
      "CLAUDE_CONFIG_DIR", "PIPELINES_DIR", "PIPELINE_RUNS_DIR", "PROJECTS_DIR", "VAULT_DIR",
      "TASKS_DIR", "AGENTS_DIR", "AGENT_DEMO_STEPS", "AGENT_DEMO_DELAY_MS", "TASK_TICK_MS",
      "LIMIT_RESUME_TICK_MS", "LIMIT_RESUME_MAX", "PIPELINE_DEMO_LIMIT_PHASES",
    ]) {
      delete process.env[k]
    }
  })

  it("pauses a pipeline mid-stage on a usage limit, then auto-resumes it to done without burning retries", async () => {
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({ id: "limitpipe", phases: [phase("a"), phase("koder"), phase("c")], instructions: "ship" })
      .expect(201)

    // The koder stage emits the usage-limit line + exits on its FIRST attempt only.
    process.env.PIPELINE_DEMO_LIMIT_PHASES = "koder"
    try {
      const start = await request(app.getHttpServer())
        .post("/api/pipelines/limitpipe/run")
        .send({})
        .expect(201)
      const runId: string = start.body.pipelineRunId

      // It halts at koder as `paused-limit`, with a resumeAt and an UNTOUCHED retry map.
      const paused = await until(async () => {
        const res = await request(app.getHttpServer()).get(`/api/pipelines/runs/${runId}`).expect(200)
        return res.body.status === "paused-limit" ? res.body : null
      })
      expect(paused.currentStage).toBe("koder")
      expect(typeof paused.resumeAt).toBe("number")
      // The pause must not have consumed any loop retry.
      expect(paused.retries?.koder ?? 0).toBe(0)

      // Wait past the (short, demo) resumeAt, then drive the resume scan by hand.
      await sleep(Math.max(0, paused.resumeAt - Date.now()) + 100)
      const limitResume = app.get(LimitResumeService)
      const done = await until(async () => {
        await limitResume.tick(new Date())
        const res = await request(app.getHttpServer()).get(`/api/pipelines/runs/${runId}`).expect(200)
        return res.body.status === "done" ? res.body : null
      })
      // It finished at the same pipeline, having auto-resumed at least once.
      expect(done.status).toBe("done")
      expect((done.limitResumeCycles ?? 0)).toBeGreaterThanOrEqual(1)

      // The activity record holds the pause/resume pair for this run.
      const activity = await request(app.getHttpServer())
        .get(`/api/activity?kinds=run-paused-limit,run-resumed-limit&limit=200`)
        .expect(200)
      const forRun = activity.body.filter((e: { refs: { runRef?: string } }) => e.refs.runRef === runId)
      const kinds = forRun.map((e: { kind: string }) => e.kind)
      expect(kinds).toContain("run-paused-limit")
      expect(kinds).toContain("run-resumed-limit")
    } finally {
      delete process.env.PIPELINE_DEMO_LIMIT_PHASES
    }
  })

  it("defers a task when the window is exhausted, and dispatches it once there is headroom", async () => {
    const limits = app.get(LimitsService)
    // Exhaust the window and bust the 5-min limits cache so the next read sees it.
    await writeLimits(configDir, 100, Math.floor(Date.now() / 1000) + 3600)
    limits.noteLimitHit()

    const deferred = await request(app.getHttpServer())
      .post("/api/tasks")
      .send({ text: "build the thing", title: "Thing" })
      .expect(201)
    expect(deferred.body.outcome).toBe("scheduled")
    expect(deferred.body.task.deferredReason).toBe("limit")
    expect(deferred.body.task.status).toBe("scheduled")

    // Restore headroom; a fresh create now dispatches.
    await writeLimits(configDir, 5, Math.floor(Date.now() / 1000) + 3600)
    limits.noteLimitHit()
    const dispatched = await request(app.getHttpServer())
      .post("/api/tasks")
      .send({ text: "build the other thing" })
      .expect(201)
    expect(dispatched.body.outcome).toBe("dispatched")
  })
})

describe("Usage-limit pause survives a restart (e2e)", () => {
  const dirs: Record<string, string> = {}
  let configDir: string

  async function boot(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeAll(async () => {
    for (const k of ["pipelines", "runs", "projects", "vault", "agents"]) {
      dirs[k] = await fs.mkdtemp(path.join(os.tmpdir(), `limitr-${k}-`))
    }
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), "limitr-config-"))
    // Pin demo mode: the repo's local .env forces AGENT_RUNNER_MODE=claude, which would
    // make stages spawn real `claude` (preflight 503 here / token burn). dotenv does not
    // override an already-set var, so this wins. Stages run via the token-free demo path.
    process.env.AGENT_RUNNER_MODE = "demo"
    process.env.CLAUDE_CONFIG_DIR = configDir
    process.env.PIPELINES_DIR = dirs.pipelines
    process.env.PIPELINE_RUNS_DIR = dirs.runs
    process.env.PROJECTS_DIR = dirs.projects
    process.env.VAULT_DIR = dirs.vault
    process.env.AGENTS_DIR = dirs.agents
    process.env.AGENT_DEMO_STEPS = "1"
    process.env.AGENT_DEMO_DELAY_MS = "10"
    process.env.LIMIT_RESUME_TICK_MS = "0"
  })

  afterAll(async () => {
    for (const d of Object.values(dirs)) await fs.rm(d, { recursive: true, force: true })
    await fs.rm(configDir, { recursive: true, force: true })
    for (const k of [
      "AGENT_RUNNER_MODE", "CLAUDE_CONFIG_DIR", "PIPELINES_DIR", "PIPELINE_RUNS_DIR", "PROJECTS_DIR", "VAULT_DIR",
      "AGENTS_DIR", "AGENT_DEMO_STEPS", "AGENT_DEMO_DELAY_MS", "LIMIT_RESUME_TICK_MS",
    ]) {
      delete process.env[k]
    }
  })

  it("a boundary-paused run is still paused-limit after a fresh boot over the same dirs", async () => {
    // Exhaust the window so the run pauses at its FIRST phase boundary (no stage spawns).
    await writeLimits(configDir, 100, Math.floor(Date.now() / 1000) + 3600)
    const app1 = await boot()
    let runId: string
    try {
      await request(app1.getHttpServer())
        .post("/api/pipelines")
        .send({ id: "boundarypipe", phases: [phase("a"), phase("b")], instructions: "ship" })
        .expect(201)
      const start = await request(app1.getHttpServer())
        .post("/api/pipelines/boundarypipe/run")
        .send({})
        .expect(201)
      runId = start.body.pipelineRunId
      await until(async () => {
        const res = await request(app1.getHttpServer()).get(`/api/pipelines/runs/${runId}`).expect(200)
        return res.body.status === "paused-limit" ? res.body : null
      })
    } finally {
      await app1.close()
    }

    // A fresh backend rebuilds the aggregate from disk; the pause survives unchanged.
    const app2 = await boot()
    try {
      const res = await request(app2.getHttpServer()).get(`/api/pipelines/runs/${runId}`).expect(200)
      expect(res.body.status).toBe("paused-limit")
    } finally {
      await app2.close()
    }
  })
})
