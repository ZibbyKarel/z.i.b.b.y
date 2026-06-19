import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

const FAKE_CLAUDE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/fake-claude.mjs")

const ENV_KEYS = [
  "AGENTS_DIR",
  "PIPELINES_DIR",
  "AGENT_RUNS_DIR",
  "TASKS_DIR",
  "PROJECTS_DIR",
  "APPROVALS_DIR",
  "BUDGET_LEDGER_DIR",
  "BUDGET_CONFIG_FILE",
  "ACTIVITY_DIR",
  "CLAUDE_BIN",
  "FAKE_CLAUDE_STEPS",
  "FAKE_CLAUDE_DELAY_MS",
] as const

/**
 * Phase 8.1 budgets & caps, end to end: a project with `dailyRuns: 1` lets the first
 * matching task dispatch (the ledger gains a line) and HOLDS the second behind a
 * `spend-past-cap` approval of kind `task`. Approving it dispatches the overage;
 * rejecting cancels. GET /api/budget reflects used/cap/held throughout. Token-free —
 * runs spawn the fake-claude stub.
 */
describe("Budget API (e2e)", () => {
  let app: INestApplication
  const dirs: Record<string, string> = {}

  const server = () => app.getHttpServer()

  const poll = async <T>(fn: () => Promise<T>, pred: (v: T) => boolean, tries = 50): Promise<T> => {
    for (let i = 0; i < tries; i++) {
      const v = await fn()
      if (pred(v)) return v
      await new Promise((r) => setTimeout(r, 40))
    }
    return fn()
  }

  const scheduled = async (id: string) => {
    const res = await request(server()).get("/api/tasks/scheduled")
    return (res.body as Array<{ id: string }>).find((t) => t.id === id) as
      | { id: string; status: string; approvalId?: string; projectId?: string }
      | undefined
  }

  beforeAll(async () => {
    for (const key of ["agents", "pipelines", "runs", "tasks", "projects", "approvals", "ledger", "activity"]) {
      dirs[key] = await fs.mkdtemp(path.join(os.tmpdir(), `budget-${key}-`))
    }
    process.env.AGENTS_DIR = dirs.agents
    process.env.PIPELINES_DIR = dirs.pipelines
    process.env.AGENT_RUNS_DIR = dirs.runs
    process.env.TASKS_DIR = dirs.tasks
    process.env.PROJECTS_DIR = dirs.projects
    process.env.APPROVALS_DIR = dirs.approvals
    process.env.BUDGET_LEDGER_DIR = dirs.ledger
    process.env.BUDGET_CONFIG_FILE = path.join(dirs.ledger!, "budget.json")
    process.env.ACTIVITY_DIR = dirs.activity
    process.env.CLAUDE_BIN = FAKE_CLAUDE
    process.env.FAKE_CLAUDE_STEPS = "2"
    process.env.FAKE_CLAUDE_DELAY_MS = "20"

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    // Seed an agent (non-empty catalog) and a budgeted engagement.
    await request(server()).post("/api/agents").send({
      id: "coder",
      name: "Coder",
      category: "Dev",
      description: "Implements fixes",
      instructions: "Write code.",
    })
    await request(server()).post("/api/projects").send({
      id: "alpha",
      name: "Alpha",
      path: dirs.projects,
      budget: { dailyRuns: 1 },
    })
  })

  afterAll(async () => {
    await app.close()
    for (const dir of Object.values(dirs)) await fs.rm(dir, { recursive: true, force: true })
    for (const k of ENV_KEYS) delete process.env[k]
  })

  it("dispatches the first task, holds the second behind a spend-past-cap approval, and accounts for it", async () => {
    // 1. First matching task dispatches and writes a ledger line.
    const first = await request(server()).post("/api/tasks").send({ text: "fix the alpha login bug" })
    expect(first.status).toBe(201)
    expect(first.body.outcome).toBe("dispatched")
    expect(first.body.task.projectId).toBe("alpha")

    let budget = (await request(server()).get("/api/budget")).body
    const alpha = budget.projects.find((p: { projectId: string }) => p.projectId === "alpha")
    expect(alpha.daily).toEqual({ used: 1, cap: 1 })

    // 2. Second matching task is over the daily cap → held behind an approval.
    const second = await request(server()).post("/api/tasks").send({ text: "refactor alpha auth module" })
    expect(second.status).toBe(201)
    expect(second.body.outcome).toBe("scheduled")
    expect(second.body.task.status).toBe("held")
    const heldTaskId = second.body.task.id as string
    expect(second.body.task.approvalId).toBeTruthy()

    // The approval is kind "task" / action "spend-past-cap".
    const approvals = (await request(server()).get("/api/approvals?status=pending")).body as Array<{
      id: string
      kind: string
      action: string
      runId: string
    }>
    const approval = approvals.find((a) => a.runId === heldTaskId)
    expect(approval).toBeDefined()
    expect(approval!.kind).toBe("task")
    expect(approval!.action).toBe("spend-past-cap")

    // GET /api/budget shows the held count.
    budget = (await request(server()).get("/api/budget")).body
    expect(budget.projects.find((p: { projectId: string }) => p.projectId === "alpha").held).toBe(1)

    // 3. Approving the override dispatches the held task.
    const approve = await request(server()).post(`/api/approvals/${approval!.id}/approve`)
    expect(approve.status).toBe(200)
    const dispatched = await poll(() => scheduled(heldTaskId), (t) => t?.status === "dispatched")
    expect(dispatched?.status).toBe("dispatched")
  })

  it("rejecting a held task's approval cancels the task", async () => {
    const res = await request(server()).post("/api/tasks").send({ text: "yet another alpha chore" })
    expect(res.body.task.status).toBe("held")
    const taskId = res.body.task.id as string
    const approvalId = res.body.task.approvalId as string

    const reject = await request(server()).post(`/api/approvals/${approvalId}/reject`)
    expect(reject.status).toBe(200)

    const cancelled = await poll(() => scheduled(taskId), (t) => t?.status === "cancelled")
    expect(cancelled?.status).toBe("cancelled")
  })

  it("exposes the global ceiling config via GET/PUT /api/budget/config", async () => {
    const put = await request(server()).put("/api/budget/config").send({ pauseAtRollingPct: 90 })
    expect(put.status).toBe(200)
    expect(put.body.pauseAtRollingPct).toBe(90)
    const get = await request(server()).get("/api/budget/config")
    expect(get.body.pauseAtRollingPct).toBe(90)
  })
})
