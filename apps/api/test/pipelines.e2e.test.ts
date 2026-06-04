import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function until<T>(fn: () => Promise<T>, timeoutMs = 10000): Promise<T> {
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

describe("Pipelines API (e2e)", () => {
  let app: INestApplication
  let pipelinesDir: string
  let runsDir: string

  async function boot(): Promise<INestApplication> {
    process.env.PIPELINES_DIR = pipelinesDir
    process.env.PIPELINE_RUNS_DIR = runsDir
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeAll(async () => {
    pipelinesDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipelines-e2e-"))
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-runs-e2e-"))
    process.env.AGENT_DEMO_STEPS = "2"
    process.env.AGENT_DEMO_DELAY_MS = "30"
    app = await boot()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(pipelinesDir, { recursive: true, force: true })
    await fs.rm(runsDir, { recursive: true, force: true })
    for (const k of ["PIPELINES_DIR", "PIPELINE_RUNS_DIR", "AGENT_DEMO_STEPS", "AGENT_DEMO_DELAY_MS", "PIPELINE_DEMO_FAIL_PHASES"]) {
      delete process.env[k]
    }
  })

  afterEach(() => {
    delete process.env.PIPELINE_DEMO_FAIL_PHASES
  })

  it("creates a pipeline; a dangling loop target is rejected (400 at the contract, 422 on update)", async () => {
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({ id: "release", phases: [phase("a"), phase("b")], instructions: "ship" })
      .expect(201)

    // On create the body is validated by the contract's superRefine → 400.
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "broken",
        phases: [phase("only", { loop: { to: "ghost", maxRetries: 1, escalate: false, then: "fail" } })],
        instructions: "x",
      })
      .expect(400)

    // The partial update body has no refine, so a dangling loop reaches storage
    // validation and surfaces as 422.
    await request(app.getHttpServer())
      .patch("/api/pipelines/release")
      .send({
        phases: [phase("a", { loop: { to: "ghost", maxRetries: 1, escalate: false, then: "fail" } })],
      })
      .expect(422)
  })

  it("runs a two-phase pipeline and hands off the produces file from A to B", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/pipelines/release/run")
      .send({ project: "zibby-core" })
      .expect(201)
    const { pipelineRunId, status } = start.body
    expect(status).toBe("running")

    const final = await until(async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/pipelines/runs/${pipelineRunId}`)
        .expect(200)
      return res.body.status !== "running" ? res.body : null
    })

    expect(final.status).toBe("done")
    expect(final.stageRuns.map((s: { phaseId: string }) => s.phaseId)).toEqual(["a", "b"])

    // The handoff: A's produces (a.out) was copied into B's cwd as B's consumes (b.in).
    const handoff = await fs.readFile(path.join(final.cwd, "b", "b.in"), "utf8")
    expect(handoff).toContain("output of a")
  })

  it("respects the maxRetries fuse: B fails, loops back to A, then fails the run", async () => {
    // B fails on every attempt. With maxRetries=1 it runs once + one retry = twice,
    // then escalates and (then: 'fail') fails the run — never infinitely.
    process.env.PIPELINE_DEMO_FAIL_PHASES = "b"
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "looped",
        phases: [
          phase("a"),
          phase("b", { loop: { to: "a", maxRetries: 1, escalate: true, then: "fail" } }),
        ],
        instructions: "loop",
      })
      .expect(201)

    const start = await request(app.getHttpServer())
      .post("/api/pipelines/looped/run")
      .send({})
      .expect(201)
    const { pipelineRunId } = start.body

    const final = await until(async () => {
      const res = await request(app.getHttpServer()).get(`/api/pipelines/runs/${pipelineRunId}`)
      return res.body.status !== "running" ? res.body : null
    })

    expect(final.status).toBe("failed")
    const bAttempts = final.stageRuns.filter((s: { phaseId: string }) => s.phaseId === "b").length
    // One initial + exactly one retry (maxRetries=1). The escalation marker may add
    // a synthetic 'b' entry, so bound it rather than demanding an exact count.
    expect(bAttempts).toBeGreaterThanOrEqual(2)
    expect(bAttempts).toBeLessThanOrEqual(3)
    // A re-ran because of the back-edge.
    const aAttempts = final.stageRuns.filter((s: { phaseId: string }) => s.phaseId === "a").length
    expect(aAttempts).toBeGreaterThanOrEqual(2)
  })

  it("reconciles a pipeline run left 'running' at restart to 'failed'", async () => {
    const runId = "ghost_1780000000000"
    const root = path.join(runsDir, runId)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: runId,
        pipelineId: "release",
        status: "running",
        currentStage: "a",
        stageRuns: [],
        startedAt: new Date().toISOString(),
        cwd: root,
      }),
      "utf8",
    )

    const app2 = await boot()
    const res = await request(app2.getHttpServer()).get(`/api/pipelines/runs/${runId}`).expect(200)
    expect(res.body.status).toBe("failed")
    expect(res.body.currentStage).toBeNull()
    await app2.close()
  })
})
