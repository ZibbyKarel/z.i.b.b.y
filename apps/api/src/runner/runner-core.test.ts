import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { RunNotFoundError, RunnerCore } from "./runner-core"
import type { BaseRun, KindStrategy } from "./runner-core.types"

// A minimal record + strategy mirroring how a real wrapper plugs into the core.
// `kind` defaults so a sidecar written before the field existed still parses.
const TestRecordSchema = z.object({
  runId: z.string(),
  kind: z.literal("agent").default("agent"),
  status: z.enum(["running", "done", "error", "interrupted", "awaiting-approval"]),
  pct: z.number(),
  cwd: z.string(),
  startedAt: z.string(),
  pid: z.number(),
  logFile: z.string(),
  pgid: z.number().int().optional(),
  label: z.string().default(""),
})
type TestRecord = z.infer<typeof TestRecordSchema> & BaseRun

const strategy: KindStrategy<TestRecord> = {
  schema: TestRecordSchema,
  assemble(base, spec) {
    return { ...base, kind: "agent", label: String(spec.extra.label ?? "") }
  },
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const NODE = process.execPath

/** A tiny inline child that prints a PROGRESS line then exits 0. */
function progressScript(pct: number): string[] {
  return ["-e", `console.log("PROGRESS ${pct}"); process.exit(0)`]
}

describe("RunnerCore", () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "runner-core-"))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("spawns a child, captures the log, and reaches done with pct 100", async () => {
    const core = new RunnerCore(dir, strategy)
    await core.init()
    const run = await core.start({
      kind: "agent",
      ownerId: "agent-007",
      command: NODE,
      args: progressScript(55),
      cwd: path.join(dir, "agent-007_sandbox"),
      extra: { label: "hello" },
    })
    expect(run.runId.startsWith("agent-007_")).toBe(true)
    expect(run.label).toBe("hello")

    // Poll the log until the run reports done.
    let offset = 0
    let log = ""
    for (let i = 0; i < 100; i++) {
      const chunk = await core.readLog(run.runId, offset)
      log += chunk.content
      offset = chunk.nextOffset
      if (chunk.done) break
      await sleep(20)
    }
    expect(log).toContain("PROGRESS 55")
    expect(core.get(run.runId).status).toBe("done")
    expect(core.get(run.runId).pct).toBe(100)
  })

  it("throws RunNotFoundError for an unknown or unsafe run id", async () => {
    const core = new RunnerCore(dir, strategy)
    await core.init()
    await expect(core.readLog("../escape", 0)).rejects.toBeInstanceOf(RunNotFoundError)
    expect(() => core.get("nope")).toThrow(RunNotFoundError)
  })

  it("reconstructs an old-format sidecar with NO `kind` field as interrupted", async () => {
    // The crucial back-compat guard: a sidecar written before `kind` existed must
    // still parse (kind defaults), and a 'running' one with no live child must be
    // reconciled to 'interrupted' with its last logged progress.
    const runId = "ghost_1780000000000_4242"
    const logFile = path.join(dir, `${runId}.log`)
    await fs.writeFile(logFile, "starting up\nPROGRESS 40\n", "utf8")
    await fs.writeFile(
      path.join(dir, `${runId}.json`),
      JSON.stringify({
        runId,
        status: "running",
        pct: 40,
        cwd: path.join(dir, "ghost"),
        startedAt: new Date().toISOString(),
        pid: 4242,
        logFile,
      }),
      "utf8",
    )

    const core = new RunnerCore(dir, strategy)
    await core.init()
    const found = core.list().find((r) => r.runId === runId)
    expect(found?.status).toBe("interrupted")
    expect(found?.pct).toBe(40)
    expect(found?.kind).toBe("agent")
  })

  it("does NOT relabel a still-alive orphan to interrupted on restart (pgid)", async () => {
    // core1 starts a long sleeper in its own process group, then "crashes"
    // (we never call shutdown) leaving the detached child alive.
    const core1 = new RunnerCore(dir, strategy)
    await core1.init()
    const run = await core1.start({
      kind: "agent",
      ownerId: "sleeper",
      command: NODE,
      args: ["-e", "setTimeout(() => process.exit(0), 4000)"],
      cwd: path.join(dir, "sleeper"),
      extra: { label: "x" },
    })
    const pgid = run.pgid
    expect(pgid).toBeGreaterThan(0)

    // Restart: a fresh core over the same dir. The sidecar says "running"; the
    // process group is still alive → it must stay running, not be reconciled.
    const core2 = new RunnerCore(dir, strategy)
    await core2.init()
    expect(core2.get(run.runId).status).toBe("running")

    // Clean up the orphan group.
    try {
      if (pgid) process.kill(-pgid, "SIGKILL")
    } catch {
      /* already gone */
    }
    core1.shutdown()
  })

  it("handles many concurrent runs without corrupting state", async () => {
    const core = new RunnerCore(dir, strategy)
    await core.init()
    const runs = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        core.start({
          kind: "agent",
          ownerId: `c${i}`,
          command: NODE,
          args: progressScript(100),
          cwd: path.join(dir, `c${i}`),
          extra: { label: `c${i}` },
        }),
      ),
    )
    // All ids are distinct and individually retrievable.
    const ids = new Set(runs.map((r) => r.runId))
    expect(ids.size).toBe(8)
    for (const r of runs) expect(core.get(r.runId).runId).toBe(r.runId)

    // Concurrent log reads don't throw, and every sidecar parses back.
    await Promise.all(runs.map((r) => core.readLog(r.runId, 0)))
    await sleep(150)
    for (const r of runs) {
      const raw = await fs.readFile(path.join(dir, `${r.runId}.json`), "utf8")
      expect(TestRecordSchema.safeParse(JSON.parse(raw)).success).toBe(true)
    }
  })

  it("leaves an awaiting-approval sidecar untouched across restart", async () => {
    const runId = "paused_1780000000000_99"
    await fs.writeFile(path.join(dir, `${runId}.log`), "waiting\n", "utf8")
    await fs.writeFile(
      path.join(dir, `${runId}.json`),
      JSON.stringify({
        runId,
        kind: "agent",
        status: "awaiting-approval",
        pct: 10,
        cwd: path.join(dir, "paused"),
        startedAt: new Date().toISOString(),
        pid: 99,
        logFile: path.join(dir, `${runId}.log`),
      }),
      "utf8",
    )

    const core = new RunnerCore(dir, strategy)
    await core.init()
    const found = core.list().find((r) => r.runId === runId)
    expect(found?.status).toBe("awaiting-approval")
  })
})
