import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import type { ActivityEntry, ActivityKind } from "@zibby/contracts"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AgentRunnerService } from "../src/agents/agent-runner.service"
import { AppModule } from "../src/app.module"

const FAKE_CLAUDE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/fake-claude.mjs")

/** An INTENT that trips a `purchase.amount > 500` threshold → the gate asks. */
const PAYMENT_INTENT = JSON.stringify({ action: "payment", metrics: { "purchase.amount": 1200 } })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function until<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 8000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const result = await fn()
    if (result) return result
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out")
    await sleep(40)
  }
}

/**
 * Phase 6.1: the activity log is the accountability record. Every dispatch,
 * approval and gate decision leaves a correlated, traceable line — read back
 * through `GET /api/activity`, never forged by a client.
 */
describe("Activity log (e2e)", () => {
  let app: INestApplication
  const dirs: Record<string, string> = {}

  async function activity(limit = 500): Promise<ActivityEntry[]> {
    const res = await request(app.getHttpServer()).get("/api/activity").query({ limit }).expect(200)
    return res.body as ActivityEntry[]
  }
  const ofKind = (entries: ActivityEntry[], kind: ActivityKind) => entries.filter((e) => e.kind === kind)

  beforeAll(async () => {
    for (const key of ["AGENTS_DIR", "PIPELINES_DIR", "AGENT_RUNS_DIR", "TASKS_DIR", "APPROVALS_DIR", "POLICY_DIR", "ACTIVITY_DIR"]) {
      dirs[key] = await fs.mkdtemp(path.join(os.tmpdir(), `act-${key}-`))
      process.env[key] = dirs[key]
    }
    process.env.TASK_TICK_MS = "0"
    process.env.CLAUDE_BIN = FAKE_CLAUDE
    process.env.FAKE_CLAUDE_STEPS = "3"
    process.env.FAKE_CLAUDE_DELAY_MS = "30"

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    // A routable agent for the task path…
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "curator", name: "Curator", description: "tidies the media library", instructions: "tidy media" })
      .expect(201)
    // …and a gated agent (threshold → ask) for the approval path.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "payer",
        name: "Payer",
        instructions: "buys things",
        risk: "high",
        gates: [
          {
            match: [{ type: "threshold", metric: "purchase.amount", op: "gt", value: 500 }],
            decision: "ask",
            resolve: { type: "human" },
          },
        ],
      })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
    for (const d of Object.values(dirs)) await fs.rm(d, { recursive: true, force: true })
    for (const k of [
      "AGENTS_DIR", "PIPELINES_DIR", "AGENT_RUNS_DIR", "TASKS_DIR", "APPROVALS_DIR", "POLICY_DIR",
      "ACTIVITY_DIR", "TASK_TICK_MS", "CLAUDE_BIN", "FAKE_CLAUDE_STEPS", "FAKE_CLAUDE_DELAY_MS", "FAKE_CLAUDE_INTENT",
    ]) {
      delete process.env[k]
    }
  })

  it("records the full task lifecycle, correlated by taskId and runRef", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/tasks")
      .send({ title: "Tidy", text: "Sort and describe the media in my library" })
      .expect(201)
    const { task, runRef } = res.body as { task: { id: string }; runRef: string }

    // Wait until the outcome has been recorded (the terminal entry of the chain).
    const entries = await until(async () => {
      const all = await activity()
      return all.some((e) => e.kind === "task-outcome" && e.refs.taskId === task.id) ? all : null
    })

    const created = ofKind(entries, "task-created").find((e) => e.refs.taskId === task.id)
    const dispatched = ofKind(entries, "task-dispatched").find((e) => e.refs.taskId === task.id)
    const started = ofKind(entries, "run-started").find((e) => e.refs.runRef === runRef)
    const finished = ofKind(entries, "run-finished").find((e) => e.refs.runRef === runRef)
    const outcome = ofKind(entries, "task-outcome").find((e) => e.refs.taskId === task.id)

    expect(created).toBeDefined()
    expect(dispatched).toBeDefined()
    expect(started).toBeDefined()
    expect(finished).toBeDefined()
    expect(outcome).toBeDefined()

    // The task entries share the originating HTTP request's traceId.
    expect(created!.traceId).toBeDefined()
    expect(dispatched!.traceId).toBe(created!.traceId)
    // The run + outcome entries point back at the same run ref.
    expect(outcome!.refs.runRef).toBe(runRef)
    expect(finished!.refs.status).toBe("done")
  })

  it("records gate-decision + approval-requested + approval-approved for a gated run", async () => {
    process.env.FAKE_CLAUDE_INTENT = PAYMENT_INTENT
    const run = await app
      .get(AgentRunnerService)
      .start("payer", "buy the expensive thing", "zibby-core", [], "")
    const runId = (run as { runId: string }).runId

    const approval = await until(async () => {
      const res = await request(app.getHttpServer()).get("/api/approvals").query({ status: "pending" }).expect(200)
      return (res.body as Array<{ id: string; runId: string }>).find((a) => a.runId === runId) ?? null
    })

    await request(app.getHttpServer()).post(`/api/approvals/${approval.id}/approve`).send({}).expect(200)
    await until(async () => {
      const res = await request(app.getHttpServer()).get(`/api/tasks/runs/${runId}`).expect(200)
      return res.body.status === "done" ? true : null
    })

    const entries = await until(async () => {
      const all = await activity()
      return all.some((e) => e.kind === "approval-approved" && e.refs.approvalId === approval.id) ? all : null
    })

    const gate = ofKind(entries, "gate-decision").find((e) => e.refs.action === "payment")
    const requested = ofKind(entries, "approval-requested").find((e) => e.refs.approvalId === approval.id)
    const approved = ofKind(entries, "approval-approved").find((e) => e.refs.approvalId === approval.id)

    expect(gate).toBeDefined()
    expect(gate!.refs.decision).toBe("ask")
    expect(requested).toBeDefined()
    expect(requested!.refs.runRef).toBe(runId)
    expect(approved).toBeDefined()
    expect(approved!.refs.decision).toBe("approved")
  })

  it("rejects a bad date with 422", async () => {
    await request(app.getHttpServer()).get("/api/activity").query({ date: "not-a-date" }).expect(422)
  })
})
