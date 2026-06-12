import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { AgentRun, PipelineRun, Project } from "@zibby/contracts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RunRecorderService } from "./run-recorder.service"
import { VaultService } from "./vault.service"

/** A scriptable runner double that captures the recorder's status listener. */
function makeRunner<T>() {
  let listener: ((run: T) => void) | null = null
  return {
    listener: () => listener,
    onRunStatus: (l: (run: T) => void) => {
      listener = l
      return () => {
        listener = null
      }
    },
    emit: (run: T) => listener?.(run),
  }
}

describe("RunRecorderService", () => {
  let vaultDir: string
  let runCwd: string
  let vault: VaultService

  beforeEach(async () => {
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "rec-vault-"))
    runCwd = await fs.mkdtemp(path.join(os.tmpdir(), "rec-run-"))
    vault = new VaultService(vaultDir)
    await vault.onModuleInit()
  })

  afterEach(async () => {
    await fs.rm(vaultDir, { recursive: true, force: true })
    await fs.rm(runCwd, { recursive: true, force: true })
  })

  /** Read today's daily note body (the single file the recorder appends to). */
  async function readDaily(): Promise<string> {
    const dailyDir = path.join(vaultDir, "daily")
    const files = await fs.readdir(dailyDir).catch(() => [])
    if (files.length === 0) return ""
    return fs.readFile(path.join(dailyDir, files[0] as string), "utf8")
  }

  const agentRun = (over: Partial<AgentRun> = {}): AgentRun =>
    ({
      runId: "coder_123",
      agentId: "coder",
      status: "done",
      title: "fix bug",
      project: "",
      cwd: runCwd,
      ...over,
    }) as AgentRun

  const pipelineRun = (over: Partial<PipelineRun> = {}): PipelineRun =>
    ({
      pipelineRunId: "delivery_123",
      pipelineId: "delivery",
      status: "done",
      currentStage: null,
      stageRuns: [{ phaseId: "a", runId: "r", attempt: 0, status: "done" }],
      startedAt: "2026-06-12T00:00:00.000Z",
      cwd: runCwd,
      ...over,
    }) as PipelineRun

  const noProjects = { get: vi.fn(async () => { throw new Error("nope") }), list: vi.fn(async () => []) }

  function build(opts: {
    agent: ReturnType<typeof makeRunner<AgentRun>>
    pipeline: ReturnType<typeof makeRunner<PipelineRun>>
    projects?: { get: (id: string) => Promise<Project>; list: () => Promise<Project[]> }
    readArtifact?: (id: string, name: string) => Promise<{ name: string; content: string } | null>
    agentList?: () => AgentRun[]
    pipelineList?: () => PipelineRun[]
  }): RunRecorderService {
    const agentRunner = { ...opts.agent, listRunning: opts.agentList ?? (() => []) }
    const pipelineRunner = {
      ...opts.pipeline,
      list: opts.pipelineList ?? (() => []),
      readArtifact: opts.readArtifact ?? (async () => null),
    }
    return new RunRecorderService(
      vault,
      agentRunner as never,
      pipelineRunner as never,
      (opts.projects ?? noProjects) as never,
    )
  }

  it("records one daily line for a terminal agent run", async () => {
    const agent = makeRunner<AgentRun>()
    const pipeline = makeRunner<PipelineRun>()
    const svc = build({ agent, pipeline })
    svc.onModuleInit()
    agent.emit(agentRun())
    await vi.waitFor(async () => expect(await readDaily()).toContain("coder_123"))
    const daily = await readDaily()
    expect(daily).toMatch(/run coder_123 \(coder\) fix bug → done/)
  })

  it("never double-records the same run (marker)", async () => {
    const agent = makeRunner<AgentRun>()
    const pipeline = makeRunner<PipelineRun>()
    const svc = build({ agent, pipeline })
    svc.onModuleInit()
    agent.emit(agentRun())
    await vi.waitFor(async () => expect(await readDaily()).toContain("coder_123"))
    agent.emit(agentRun())
    // Give the second emission a chance to (not) write.
    await new Promise((r) => setTimeout(r, 30))
    const count = (await readDaily()).match(/coder_123/g)?.length ?? 0
    expect(count).toBe(1)
  })

  it("ignores non-terminal statuses", async () => {
    const agent = makeRunner<AgentRun>()
    const pipeline = makeRunner<PipelineRun>()
    const svc = build({ agent, pipeline })
    svc.onModuleInit()
    agent.emit(agentRun({ status: "running" }))
    pipeline.emit(pipelineRun({ status: "parked" }))
    await new Promise((r) => setTimeout(r, 30))
    expect(await readDaily()).toBe("")
  })

  it("bootstrap sweep records a pre-existing terminal run", async () => {
    const agent = makeRunner<AgentRun>()
    const pipeline = makeRunner<PipelineRun>()
    const svc = build({ agent, pipeline, agentList: () => [agentRun({ runId: "swept_9" })] })
    await svc.onApplicationBootstrap()
    expect(await readDaily()).toContain("swept_9")
  })

  it("files learned.md as a knowledge note, links the project MOC, double-links the daily line", async () => {
    const project: Project = { id: "acme", name: "ACME", path: "/repos/acme" }
    const agent = makeRunner<AgentRun>()
    const pipeline = makeRunner<PipelineRun>()
    const svc = build({
      agent,
      pipeline,
      projects: { get: async () => { throw new Error() }, list: async () => [project] },
      readArtifact: async (_id, name) =>
        name === "learned.md" ? { name, content: "- Durable fact about ACME." } : null,
    })
    svc.onModuleInit()
    pipeline.emit(pipelineRun({ projectPath: "/repos/acme" }))
    await vi.waitFor(async () => expect(await readDaily()).toContain("delivery_123"))

    const learned = await vault.note("learned-delivery_123")
    expect(learned.tier).toBe("knowledge")
    expect(learned.body).toContain("Durable fact about ACME")
    expect(learned.frontmatter.source).toBe("delivery_123")

    const moc = await vault.note("acme")
    expect(moc.links).toContain("learned-delivery_123")

    const daily = await readDaily()
    expect(daily).toContain("[[acme]]")
    expect(daily).toContain("[[learned-delivery_123]]")
  })

  it("records a failed pipeline as a daily line only (no learned note)", async () => {
    const agent = makeRunner<AgentRun>()
    const pipeline = makeRunner<PipelineRun>()
    const readArtifact = vi.fn(async () => ({ name: "learned.md", content: "x" }))
    const svc = build({ agent, pipeline, readArtifact })
    svc.onModuleInit()
    pipeline.emit(pipelineRun({ status: "failed" }))
    await vi.waitFor(async () => expect(await readDaily()).toContain("delivery_123"))
    expect(await readDaily()).toMatch(/pipeline delivery_123 \(delivery\) → failed/)
    // A failed run never reaches the learned-note path.
    expect(readArtifact).not.toHaveBeenCalled()
    await expect(vault.note("learned-delivery_123")).rejects.toThrow()
  })
})
