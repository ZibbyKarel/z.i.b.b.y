import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"
import { DiscoveryTriageService } from "../src/discovery/discovery-triage.service"

const FAKE_CLAUDE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/fake-claude.mjs")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until<T>(fn: () => Promise<T>, timeoutMs = 15000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const result = await fn()
    if (result) return result
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out")
    await sleep(40)
  }
}

describe("Discovery triage API (e2e)", () => {
  let app: INestApplication
  const dirs: Record<string, string> = {}
  let failProjPath: string
  let cleanProjPath: string

  async function boot(): Promise<INestApplication> {
    Object.assign(process.env, {
      PROJECTS_DIR: dirs.projects,
      PROPOSALS_DIR: dirs.proposals,
      APPROVALS_DIR: dirs.approvals,
      TASKS_DIR: dirs.tasks,
      VAULT_DIR: dirs.vault,
      GOALS_DIR: dirs.goals,
      GOAL_RUNS_DIR: dirs.goalRuns,
      AGENTS_DIR: dirs.agents,
      AGENT_RUNS_DIR: dirs.agentRuns,
      PIPELINES_DIR: dirs.pipelines,
      PIPELINE_RUNS_DIR: dirs.pipelineRuns,
      AUTOMATIONS_DIR: dirs.automations,
      CLAUDE_BIN: FAKE_CLAUDE,
      FAKE_CLAUDE_STEPS: "1",
      FAKE_CLAUDE_DELAY_MS: "10",
    })
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeAll(async () => {
    for (const k of [
      "projects", "proposals", "approvals", "tasks", "vault", "goals", "goalRuns",
      "agents", "agentRuns", "pipelines", "pipelineRuns", "automations",
    ]) {
      dirs[k] = await fs.mkdtemp(path.join(os.tmpdir(), `disc-${k}-`))
    }
    failProjPath = await fs.mkdtemp(path.join(os.tmpdir(), "disc-failproj-"))
    cleanProjPath = await fs.mkdtemp(path.join(os.tmpdir(), "disc-cleanproj-"))
    app = await boot()

    // An agent so an approved (target-less) candidate has a route to classify to.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "fixer", instructions: "Fix whatever is broken.", model: "sonnet" })
      .expect(201)
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "failing-proj", name: "failing-proj", path: failProjPath, checks: ["false"] })
      .expect(201)
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "clean-proj", name: "clean-proj", path: cleanProjPath, checks: ["true"] })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
    for (const d of [...Object.values(dirs), failProjPath, cleanProjPath]) {
      await fs.rm(d, { recursive: true, force: true })
    }
    for (const k of [
      "PROJECTS_DIR", "PROPOSALS_DIR", "APPROVALS_DIR", "TASKS_DIR", "VAULT_DIR", "GOALS_DIR",
      "GOAL_RUNS_DIR", "AGENTS_DIR", "AGENT_RUNS_DIR", "PIPELINES_DIR", "PIPELINE_RUNS_DIR",
      "AUTOMATIONS_DIR", "CLAUDE_BIN", "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
    ]) {
      delete process.env[k]
    }
  })

  it("scans failing checks → a proposal in the gate, and starts NO run (proposed ≠ dispatched)", async () => {
    const discovery = app.get(DiscoveryTriageService)
    const parked = await discovery.run()
    expect(parked).toHaveLength(1) // only the failing project produces a candidate

    const proposals = await request(app.getHttpServer()).get("/api/discovery/proposals").expect(200)
    expect(proposals.body).toHaveLength(1)
    expect(proposals.body[0].candidate.title).toContain("failing-proj")
    expect(proposals.body[0].state).toBe("proposed")

    const pending = await request(app.getHttpServer())
      .get("/api/approvals")
      .query({ status: "pending" })
      .expect(200)
    const proposed = pending.body.filter((a: { kind: string }) => a.kind === "proposed-task")
    expect(proposed).toHaveLength(1)

    // Law 4: discovery only PARKED — no run of any kind was started. The unified feed
    // folds a goal's maker/verifier children out, so a per-kind filter of one list is
    // the faithful reconstruction of the old per-kind history counts.
    const feed = (await request(app.getHttpServer()).get("/api/tasks/runs").expect(200))
      .body as Array<{ kind: string }>
    expect(feed.filter((r) => r.kind === "agent")).toHaveLength(0)
    expect(feed.filter((r) => r.kind === "pipeline")).toHaveLength(0)
    expect(feed.filter((r) => r.kind === "goal")).toHaveLength(0)
  })

  it("approving a proposal dispatches the task through the normal path", async () => {
    const pending = await request(app.getHttpServer())
      .get("/api/approvals")
      .query({ status: "pending" })
      .expect(200)
    const approval = pending.body.find((a: { kind: string }) => a.kind === "proposed-task")
    expect(approval).toBeTruthy()

    await request(app.getHttpServer()).post(`/api/approvals/${approval.id}/approve`).send({}).expect(200)

    // The proposal flips to dispatched once createTask runs.
    const dispatched = await until(async () => {
      const res = await request(app.getHttpServer()).get("/api/discovery/proposals").expect(200)
      const p = res.body.find((x: { state: string }) => x.state === "dispatched")
      return p ?? null
    })
    expect(dispatched.state).toBe("dispatched")
  })
})
