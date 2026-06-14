import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import type { Briefing } from "@zibby/contracts"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"
import { ChannelWatcherService } from "../src/channels/channel-watcher.service"
import { SchedulerService } from "../src/automations/scheduler.service"

const FAKE_CLAUDE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/fake-claude.mjs")
const PAYMENT_INTENT = JSON.stringify({ action: "payment", metrics: { "purchase.amount": 1200 } })
const TODAY = new Date().toISOString().slice(0, 10)

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

/** Phase 6.2: the butler's briefing — assembled from the record, persisted to the vault. */
describe("Briefing (e2e)", () => {
  let app: INestApplication
  let root: string
  let fakeDir: string

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "briefing-flow-e2e-"))
    fakeDir = path.join(root, "fake")
    process.env.ZIBBY_DATA_DIR = root
    process.env.CHANNEL_FAKE_DIR = fakeDir
    process.env.CHANNEL_ADAPTER_MODE = "fake"
    process.env.CHANNEL_TICK_MS = "0"
    process.env.AUTOMATION_TICK_MS = "0"
    process.env.TASK_TICK_MS = "0"
    process.env.CLAUDE_BIN = FAKE_CLAUDE
    process.env.FAKE_CLAUDE_STEPS = "4"
    process.env.FAKE_CLAUDE_DELAY_MS = "30"

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    // A gated agent → produces a pending approval (a needs-you line).
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "payer",
        name: "Payer",
        instructions: "buys things",
        risk: "high",
        gates: [{ match: [{ type: "threshold", metric: "purchase.amount", op: "gt", value: 500 }], decision: "ask", resolve: { type: "human" } }],
      })
      .expect(201)
    // A channel integration → a watched channel.
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({ id: "team", kind: "slack", name: "Team", config: { kind: "slack", channels: ["C1"] } })
      .expect(201)
    await request(app.getHttpServer()).put("/api/integrations/team/credentials").send({ token: "xoxb-1" }).expect(200)
  })

  afterAll(async () => {
    await app.close()
    // A run child may still be flushing its `.log` into `root` when cleanup runs
    // (same transient as runner-core.test.ts:90-96); retry the rm on ENOTEMPTY.
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    for (const k of [
      "ZIBBY_DATA_DIR", "CHANNEL_FAKE_DIR", "CHANNEL_ADAPTER_MODE", "CHANNEL_TICK_MS",
      "AUTOMATION_TICK_MS", "TASK_TICK_MS", "CLAUDE_BIN", "FAKE_CLAUDE_STEPS", "FAKE_CLAUDE_DELAY_MS", "FAKE_CLAUDE_INTENT",
    ]) {
      delete process.env[k]
    }
  })

  it("GET /api/briefing surfaces the pending approval and the watched channel", async () => {
    // Spawn a gated run that parks at the approval gate.
    process.env.FAKE_CLAUDE_INTENT = PAYMENT_INTENT
    const run = await request(app.getHttpServer())
      .post("/api/agents/payer/run")
      .send({ prompt: "buy the expensive thing", project: "zibby-core" })
      .expect(201)
    const runId = (run.body as { runId: string }).runId
    await until(async () => {
      const pending = await request(app.getHttpServer()).get("/api/approvals?status=pending").expect(200)
      return (pending.body as Array<{ runId: string }>).some((a) => a.runId === runId) ? true : null
    })

    // Ingest a Tier-3 channel message so the item stays in flight (watched).
    await fs.mkdir(path.join(fakeDir, "team"), { recursive: true })
    await fs.writeFile(
      path.join(fakeDir, "team", "001.json"),
      JSON.stringify({ text: "Tady je nabídka a smlouva s deadline", receivedAt: "2026-06-12T00:00:00.000Z" }),
    )
    await app.get(ChannelWatcherService).tick()

    const briefing = (await request(app.getHttpServer()).get("/api/briefing").expect(200)).body as Briefing
    expect(briefing.nothingNeedsYou).toBe(false)
    expect(briefing.needsYou.length).toBeGreaterThanOrEqual(1)
    expect(briefing.counts.approvalsPending).toBeGreaterThanOrEqual(1)
    expect(briefing.watching.some((w) => w.integrationId === "team")).toBe(true)
  })

  it("POST /api/briefing/generate persists the note + the daily link", async () => {
    const res = await request(app.getHttpServer()).post("/api/briefing/generate").send({}).expect(201)
    const { noteId, briefing } = res.body as { noteId: string; briefing: Briefing }
    expect(noteId).toBe(`briefing-${TODAY}`)
    expect(briefing.generatedAt).toBeTruthy()

    // The briefing note exists with its sections.
    const note = await request(app.getHttpServer()).get(`/api/memory/note/${noteId}`).expect(200)
    expect(note.body.body).toContain("## Needs you")
    expect(note.body.tier).toBe("daily")

    // The daily note links the briefing.
    const daily = await request(app.getHttpServer()).get(`/api/memory/note/${TODAY}`).expect(200)
    expect(daily.body.body).toContain(`[[${noteId}]]`)
  })

  it("re-generating the same day updates the note rather than 409ing", async () => {
    await request(app.getHttpServer()).post("/api/briefing/generate").send({}).expect(201)
  })

  it("the morning-briefing automation fires once per wall minute", async () => {
    await request(app.getHttpServer())
      .post("/api/automations")
      .send({ id: "morning-briefing", name: "Morning briefing", trigger: { type: "cron", expr: "0 7 * * *" }, target: { type: "briefing" }, enabled: true })
      .expect(201)

    const scheduler = app.get(SchedulerService)
    // 07:00 Europe/Prague (CEST = UTC+2 in June) = 05:00 UTC.
    const at0700 = new Date("2026-06-12T05:00:00.000Z")
    const fired = await scheduler.tick(at0700)
    expect(fired).toContain("morning-briefing")
    // Idempotent within the same wall minute.
    const again = await scheduler.tick(at0700)
    expect(again).not.toContain("morning-briefing")
  })
})
