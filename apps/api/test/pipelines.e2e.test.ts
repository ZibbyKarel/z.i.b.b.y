import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

/** Token-free stand-in for the real `claude` CLI (see fixtures/fake-claude.mjs). */
const FAKE_CLAUDE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/fake-claude.mjs")
/** Check script that fails on its first invocation, then passes (see fixtures/flaky-check.mjs). */
const FLAKY_CHECK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/flaky-check.mjs")

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
  let projectsDir: string

  async function boot(): Promise<INestApplication> {
    process.env.PIPELINES_DIR = pipelinesDir
    process.env.PIPELINE_RUNS_DIR = runsDir
    process.env.PROJECTS_DIR = projectsDir
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeAll(async () => {
    pipelinesDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipelines-e2e-"))
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-runs-e2e-"))
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-projects-e2e-"))
    process.env.AGENT_DEMO_STEPS = "2"
    process.env.AGENT_DEMO_DELAY_MS = "30"
    app = await boot()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(pipelinesDir, { recursive: true, force: true })
    await fs.rm(runsDir, { recursive: true, force: true })
    await fs.rm(projectsDir, { recursive: true, force: true })
    for (const k of ["PIPELINES_DIR", "PIPELINE_RUNS_DIR", "PROJECTS_DIR", "AGENT_DEMO_STEPS", "AGENT_DEMO_DELAY_MS", "PIPELINE_DEMO_FAIL_PHASES"]) {
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

  it("a verify phase runs the project checks: red → loop back → green → done", async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "verify-proj-"))
    const marker = path.join(projectDir, "fixed.marker")
    const check = `${JSON.stringify(process.execPath)} ${JSON.stringify(FLAKY_CHECK)} ${JSON.stringify(marker)}`

    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "verify-proj", name: "Verify project", path: projectDir, checks: [check] })
      .expect(201)

    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "verified",
        phases: [
          phase("a"),
          { id: "v", type: "verify", loop: { to: "a", maxRetries: 1, escalate: false, then: "fail" } },
          phase("b"),
        ],
        instructions: "agent → verify → agent",
      })
      .expect(201)

    const start = await request(app.getHttpServer())
      .post("/api/pipelines/verified/run")
      .send({ project: "verify-proj" })
      .expect(201)
    expect(start.body.projectPath).toBe(projectDir)
    const { pipelineRunId } = start.body

    const final = await until(async () => {
      const res = await request(app.getHttpServer()).get(`/api/pipelines/runs/${pipelineRunId}`)
      return res.body.status !== "running" ? res.body : null
    })

    expect(final.status).toBe("done")
    // First verify ran red (creating the marker), looped back to `a`, then green.
    expect(
      final.stageRuns.map((s: { phaseId: string; status: string }) => `${s.phaseId}:${s.status}`),
    ).toEqual(["a:done", "v:error", "a:done", "v:done", "b:done"])

    // Handoff passthrough: verify transforms nothing, so `b` still consumed `a`'s output.
    const handoff = await fs.readFile(path.join(final.cwd, "b", "b.in"), "utf8")
    expect(handoff).toContain("output of a")

    await fs.rm(projectDir, { recursive: true, force: true })
  })

  it("retries exhaustion with then:'park' parks the run; resume-with-note completes it", async () => {
    process.env.PIPELINE_DEMO_FAIL_PHASES = "b"
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "parking",
        phases: [
          phase("a"),
          phase("b", { loop: { to: "a", maxRetries: 0, escalate: true, then: "park" } }),
        ],
        instructions: "park on exhaustion",
      })
      .expect(201)

    const start = await request(app.getHttpServer())
      .post("/api/pipelines/parking/run")
      .send({})
      .expect(201)
    const { pipelineRunId } = start.body

    // b fails, maxRetries 0 → immediately exhausted → durable parking.
    const parked = await until(async () => {
      const res = await request(app.getHttpServer()).get(`/api/pipelines/runs/${pipelineRunId}`)
      return res.body.status === "parked" ? res.body : null
    })
    expect(parked.parkedReason).toBe("retries")
    expect(parked.parked).toMatchObject({ phaseId: "b", attempts: 1 })

    // A premature resume of a non-parked run 409s (sanity: wrong id state).
    delete process.env.PIPELINE_DEMO_FAIL_PHASES
    const resumed = await request(app.getHttpServer())
      .post(`/api/pipelines/runs/${pipelineRunId}/resume`)
      .send({ note: "zelená cesta — tentokrát to projde" })
      .expect(200)
    expect(resumed.body.status).toBe("running")

    const final = await until(async () => {
      const res = await request(app.getHttpServer()).get(`/api/pipelines/runs/${pipelineRunId}`)
      return res.body.status !== "running" ? res.body : null
    })
    expect(final.status).toBe("done")
    // The note landed next to the run for the audit trail.
    const note = await fs.readFile(path.join(final.cwd, "b.note.md"), "utf8")
    expect(note).toContain("zelená cesta")

    // Resuming a finished run is refused.
    await request(app.getHttpServer())
      .post(`/api/pipelines/runs/${pipelineRunId}/resume`)
      .send({})
      .expect(409)
  })

  it("a retries-parked run survives a restart still parked (and resumable)", async () => {
    const runId = "parking_1780000000002"
    const root = path.join(runsDir, runId)
    await fs.mkdir(root, { recursive: true })
    const failureFile = path.join(root, "b.failure.txt")
    await fs.writeFile(failureFile, 'Phase "b" failed (attempt 1).', "utf8")
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: runId,
        pipelineId: "parking",
        status: "parked",
        parkedReason: "retries",
        parked: { phaseId: "b", attempts: 1, failureFile },
        retries: { b: 0 },
        currentStage: "b",
        stageRuns: [],
        startedAt: new Date().toISOString(),
        cwd: root,
      }),
      "utf8",
    )

    const app2 = await boot()
    const res = await request(app2.getHttpServer()).get(`/api/pipelines/runs/${runId}`).expect(200)
    expect(res.body.status).toBe("parked")
    expect(res.body.parkedReason).toBe("retries")
    await app2.close()
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

describe("Pipeline stage gates (claude mode, e2e)", () => {
  let app: INestApplication
  let dirs: string[]

  /** An INTENT the gated agent's `ask` rule matches. */
  const DELETE_INTENT = JSON.stringify({ action: "delete" })

  async function boot(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeAll(async () => {
    const make = (label: string) => fs.mkdtemp(path.join(os.tmpdir(), `pipe-gate-${label}-`))
    const [pipelinesDir, runsDir, agentsDir, agentRunsDir, approvalsDir, policyDir] =
      await Promise.all([make("p"), make("r"), make("a"), make("ar"), make("appr"), make("pol")])
    dirs = [pipelinesDir, runsDir, agentsDir, agentRunsDir, approvalsDir, policyDir]
    process.env.PIPELINES_DIR = pipelinesDir
    process.env.PIPELINE_RUNS_DIR = runsDir
    process.env.AGENTS_DIR = agentsDir
    process.env.AGENT_RUNS_DIR = agentRunsDir
    process.env.APPROVALS_DIR = approvalsDir
    process.env.POLICY_DIR = policyDir
    // Exercise the production claude stage branch with the token-free stub; its
    // intent-request.json is the real Variant B trigger the core watches for.
    process.env.AGENT_RUNNER_MODE = "claude"
    process.env.CLAUDE_BIN = FAKE_CLAUDE
    process.env.FAKE_CLAUDE_STEPS = "4"
    process.env.FAKE_CLAUDE_DELAY_MS = "40"
    process.env.FAKE_CLAUDE_INTENT = DELETE_INTENT
    app = await boot()

    // The phase agent: deletes pause for a human; everything else is free.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "gated-writer",
        name: "Gated writer",
        instructions: "writes, deletes behind the gate",
        risk: "high",
        gates: [
          {
            match: [{ type: "action", action: "delete" }],
            decision: "ask",
            resolve: { type: "human" },
          },
        ],
      })
      .expect(201)

    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "gated",
        phases: [
          {
            id: "write",
            agent: "gated-writer",
            consumes: "task.md",
            produces: "out.md",
            model: "sonnet",
            thinking: "medium",
          },
        ],
        instructions: "gated pipeline",
      })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
    for (const d of dirs) await fs.rm(d, { recursive: true, force: true })
    for (const k of [
      "PIPELINES_DIR",
      "PIPELINE_RUNS_DIR",
      "AGENTS_DIR",
      "AGENT_RUNS_DIR",
      "APPROVALS_DIR",
      "POLICY_DIR",
      "AGENT_RUNNER_MODE",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
      "FAKE_CLAUDE_INTENT",
    ]) {
      delete process.env[k]
    }
  })

  const runStatus = async (pipelineRunId: string) =>
    (await request(app.getHttpServer()).get(`/api/pipelines/runs/${pipelineRunId}`).expect(200))
      .body as { status: string; stageRuns: { status: string }[] }

  const pendingStageApproval = async (pipelineRunId: string) => {
    const res = await request(app.getHttpServer())
      .get("/api/approvals")
      .query({ status: "pending" })
      .expect(200)
    return res.body.find(
      (a: { runId: string; kind: string }) =>
        a.kind === "pipeline-stage" && a.runId.startsWith(`${pipelineRunId}.`),
    ) as { id: string; runId: string } | undefined
  }

  it("parks on a gated stage intent, then approve releases the SAME child to done", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/pipelines/gated/run")
      .send({})
      .expect(201)
    const { pipelineRunId } = start.body as { pipelineRunId: string }

    // The stage announces the delete → aggregate parks + a stage approval appears.
    await until(async () => ((await runStatus(pipelineRunId)).status === "parked" ? true : null))
    const approval = await until(() => pendingStageApproval(pipelineRunId))

    await request(app.getHttpServer()).post(`/api/approvals/${approval.id}/approve`).expect(200)

    // The blocked child proceeds (no respawn) and the run finishes.
    const final = await until(async () => {
      const run = await runStatus(pipelineRunId)
      return run.status !== "running" && run.status !== "parked" ? run : null
    })
    expect(final.status).toBe("done")
    expect(final.stageRuns.map((s) => s.status)).toEqual(["done"])
  })

  it("reject aborts the gated stage and fails the run", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/pipelines/gated/run")
      .send({})
      .expect(201)
    const { pipelineRunId } = start.body as { pipelineRunId: string }

    await until(async () => ((await runStatus(pipelineRunId)).status === "parked" ? true : null))
    const approval = await until(() => pendingStageApproval(pipelineRunId))

    await request(app.getHttpServer()).post(`/api/approvals/${approval.id}/reject`).expect(200)

    const final = await until(async () => {
      const run = await runStatus(pipelineRunId)
      return run.status !== "running" && run.status !== "parked" ? run : null
    })
    expect(final.status).toBe("failed")
    expect(final.stageRuns.map((s) => s.status)).toEqual(["interrupted"])
  })

  it("reconciles a run left 'parked' at restart to 'failed' (its child died with the API)", async () => {
    const runId = "gated_1780000000001"
    const root = path.join(process.env.PIPELINE_RUNS_DIR as string, runId)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: runId,
        pipelineId: "gated",
        status: "parked",
        currentStage: "write",
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
