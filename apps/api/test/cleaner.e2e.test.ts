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
    await sleep(40)
  }
}

const exists = (p: string) =>
  fs
    .access(p)
    .then(() => true)
    .catch(() => false)

/**
 * The Cleaner agent end to end: with no target directory in the prompt it seeds a
 * throwaway sandbox, finds the junk + duplicates, pauses mid-run on the `delete`
 * floor rule, and only after approval removes exactly the announced files.
 */
describe("Cleaner agent (Variant B, e2e)", () => {
  let app: INestApplication
  let agentsDir: string
  let runsDir: string
  let approvalsDir: string
  let policyDir: string
  const prevRunnerMode = process.env.AGENT_RUNNER_MODE

  async function boot(): Promise<INestApplication> {
    process.env.AGENTS_DIR = agentsDir
    process.env.AGENT_RUNS_DIR = runsDir
    process.env.APPROVALS_DIR = approvalsDir
    process.env.POLICY_DIR = policyDir
    // The Cleaner is a real-task agent: it must run its deterministic approval-gate
    // script even in claude mode (where a `claude -p … --permission-mode dontAsk`
    // session would bypass the gate). Booting under claude mode locks that in.
    process.env.AGENT_RUNNER_MODE = "claude"
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  const runStatus = async (runId: string) =>
    (await request(app.getHttpServer()).get(`/api/agents/runs/${runId}`).expect(200)).body
      .status as string

  const pendingFor = async (runId: string) => {
    const res = await request(app.getHttpServer())
      .get("/api/approvals")
      .query({ status: "pending" })
      .expect(200)
    return res.body.find((a: { runId: string }) => a.runId === runId)
  }

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "clean-agents-"))
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "clean-runs-"))
    approvalsDir = await fs.mkdtemp(path.join(os.tmpdir(), "clean-store-"))
    policyDir = await fs.mkdtemp(path.join(os.tmpdir(), "clean-policy-"))
    app = await boot()

    // No gates: the `delete` floor rule (ask:human) does the gating on its own.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "cleaner", name: "Cleaner", instructions: "tidies directories", risk: "high" })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
    for (const d of [agentsDir, runsDir, approvalsDir, policyDir]) {
      await fs.rm(d, { recursive: true, force: true })
    }
    for (const k of ["AGENTS_DIR", "AGENT_RUNS_DIR", "APPROVALS_DIR", "POLICY_DIR"]) {
      delete process.env[k]
    }
    if (prevRunnerMode === undefined) delete process.env.AGENT_RUNNER_MODE
    else process.env.AGENT_RUNNER_MODE = prevRunnerMode
  })

  it("seeds a sandbox, pauses for approval, then deletes exactly the approved files", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/agents/cleaner/run")
      .send({ prompt: "tidy up my workspace", project: "zibby-core" })
      .expect(201)
    const { runId, cwd } = start.body as { runId: string; cwd: string }

    // It pauses mid-run with a pending approval naming the deletion.
    await until(async () => ((await runStatus(runId)) === "awaiting-approval" ? true : null))
    const approval = await until(async () => (await pendingFor(runId)) ?? null)
    expect(approval.action).toBe("delete")
    expect(approval.risk).toBe("high")

    // The deletion list reached the card as enrichment JSON (a `command` preview).
    const enrichment = JSON.parse(approval.detail)
    expect(enrichment.riskType).toBe("mazani")
    expect(enrichment.preview.kind).toBe("command")
    expect(enrichment.preview.targets.length).toBeGreaterThan(0)

    // The seeded junk/duplicate files exist; the file Cleaner keeps also exists.
    expect(await exists(path.join(cwd, "scratch.tmp"))).toBe(true)
    expect(await exists(path.join(cwd, "report-final.txt"))).toBe(true)
    const reportCopiesBefore = (await fs.readdir(cwd)).filter((f) => f.startsWith("report-copy"))
    expect(reportCopiesBefore.length).toBe(2)

    await request(app.getHttpServer())
      .post(`/api/approvals/${approval.id}/approve`)
      .send({})
      .expect(200)

    await until(async () => ((await runStatus(runId)) === "done" ? true : null))

    // Junk and empties are gone; the unique file survives; exactly one duplicate remains.
    expect(await exists(path.join(cwd, "scratch.tmp"))).toBe(false)
    expect(await exists(path.join(cwd, "build.log"))).toBe(false)
    expect(await exists(path.join(cwd, "empty.txt"))).toBe(false)
    expect(await exists(path.join(cwd, ".DS_Store"))).toBe(false)
    expect(await exists(path.join(cwd, "report-final.txt"))).toBe(true)
    const reportCopiesAfter = (await fs.readdir(cwd)).filter((f) => f.startsWith("report-copy"))
    expect(reportCopiesAfter.length).toBe(1)
  })

  it("rejecting the deletion leaves every file untouched and interrupts the run", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/agents/cleaner/run")
      .send({ prompt: "tidy up again", project: "zibby-core" })
      .expect(201)
    const { runId, cwd } = start.body as { runId: string; cwd: string }

    const approval = await until(async () => (await pendingFor(runId)) ?? null)
    await request(app.getHttpServer())
      .post(`/api/approvals/${approval.id}/reject`)
      .send({})
      .expect(200)

    await until(async () => ((await runStatus(runId)) === "interrupted" ? true : null))
    // Nothing was removed — the junk the agent proposed is all still there.
    expect(await exists(path.join(cwd, "scratch.tmp"))).toBe(true)
    expect(await exists(path.join(cwd, ".DS_Store"))).toBe(true)
    expect(await exists(path.join(cwd, "empty.txt"))).toBe(true)
  })
})
