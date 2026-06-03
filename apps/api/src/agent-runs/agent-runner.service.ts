import { type ChildProcess, spawn } from "node:child_process"
import { type WriteStream, createWriteStream } from "node:fs"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import { type AgentRun, AgentRunSchema } from "@zibby/contracts"
import { AgentsStorageService } from "../agents/agents.storage.service"

/** DI token carrying the absolute path of the directory that holds run artifacts. */
export const RUNS_DIR = "RUNS_DIR"

/** A run id may only contain the safe characters our filenames are built from. */
const RUN_ID_REGEX = /^[a-zA-Z0-9._-]+$/

/** Finished runs stay in the list (and in memory) for this long after they start. */
const RETENTION_MS = 30 * 60 * 1000

/** Hard cap on how many runs the list returns, newest first. */
const MAX_LISTED = 50

/** Thrown when a run id is unknown or unsafe — the controller maps it to a 404. */
export class RunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Run "${runId}" not found`)
    this.name = "RunNotFoundError"
  }
}

interface RunHandle {
  run: AgentRun
  /** The live process, when this run was started in *this* backend process. A run
   * reconstructed from disk after a restart has no child (it cannot be resumed). */
  child?: ChildProcess
  log?: WriteStream
}

/**
 * Spawns agents as child processes and tracks their runs durably.
 *
 * Persistence has two parts that together survive both a frontend reload and a
 * backend restart:
 * - the **log file** (`<runId>.log`) — captured stdout/stderr, the human-readable
 *   record;
 * - a **sidecar** (`<runId>.json`) — the structured metadata a log can't reliably
 *   carry (prompt, project, final status), serialized as an {@link AgentRun}.
 *
 * On startup {@link onModuleInit} rebuilds the in-memory registry from the
 * sidecars on disk. A sidecar still marked `running` means its process died with
 * the previous backend (the child is a child of the API process) — it can't be
 * resumed, so it is reconciled to `interrupted`. Caveat: a hard crash (kill -9 /
 * OOM) reparents children to init, so such an orphan may keep running yet still be
 * relabelled `interrupted` — acceptable for the demo; revisit for the real
 * `claude -p` executor.
 *
 * Demo mode: every run executes the bundled token-free `demo-task.mjs` (it does
 * not interpret the agent's `instructions`). Set `AGENT_RUNNER_MODE=claude` to
 * spawn `claude -p <prompt>` instead — a one-line swap, off by default so the test
 * agent never burns tokens.
 */
@Injectable()
export class AgentRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly dir: string
  private readonly runs = new Map<string, RunHandle>()

  constructor(
    @Inject(RUNS_DIR) dir: string,
    private readonly agents: AgentsStorageService,
  ) {
    this.dir = path.resolve(dir)
  }

  /** Rebuild the registry from disk so runs survive a backend restart. */
  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    const entries = await fs.readdir(this.dir).catch(() => [] as string[])
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue
      const raw = await fs.readFile(path.join(this.dir, entry), "utf8").catch(() => null)
      if (raw === null) continue
      let data: unknown
      try {
        data = JSON.parse(raw)
      } catch {
        continue
      }
      const parsed = AgentRunSchema.safeParse(data)
      if (!parsed.success) continue
      let run = parsed.data
      // A run left "running" in a sidecar can't be live in this fresh process.
      if (run.status === "running") {
        run = {
          ...run,
          status: "interrupted",
          pct: await this.readLastProgress(run.logFile, run.pct),
        }
        await this.writeSidecar(run)
      }
      this.runs.set(run.runId, { run })
    }
  }

  /** Kill any still-live children on shutdown so we don't leak zombies. */
  onModuleDestroy(): void {
    for (const handle of this.runs.values()) {
      if (handle.child && handle.run.status === "running") handle.child.kill()
    }
  }

  /**
   * Start a run of `agentId`. Verifies the agent exists (a missing/invalid id
   * surfaces as the storage layer's not-found error → 404), spawns the command in
   * a fresh per-run sandbox folder, and wires its output to a log file plus a
   * metadata sidecar.
   */
  async start(agentId: string, prompt: string, project: string): Promise<AgentRun> {
    // Throws AgentNotFoundError / InvalidAgentIdError when the agent is unknown.
    await this.agents.get(agentId)

    const startedMs = Date.now()
    await fs.mkdir(this.dir, { recursive: true })
    // The sandbox the task runs in (and writes its file into). Named without the
    // pid since we need it before spawning; the log file below carries the pid.
    const cwd = path.join(this.dir, `${agentId}_${startedMs}`)
    await fs.mkdir(cwd, { recursive: true })

    const { command, args } = this.buildCommand(prompt, cwd)
    const child = spawn(command, args, { cwd, env: process.env })

    // `child.pid` is set synchronously, and listeners attached now (before the
    // next tick) cannot miss any output — so no early lines are lost.
    const pid = child.pid ?? 0
    const runId = `${agentId}_${startedMs}_${pid}`
    const logFile = path.join(this.dir, `${runId}.log`)
    const log = createWriteStream(logFile, { flags: "a" })

    const run: AgentRun = {
      runId,
      agentId,
      status: "running",
      pct: 0,
      prompt,
      project,
      cwd,
      startedAt: new Date(startedMs).toISOString(),
      pid,
      logFile,
    }
    const handle: RunHandle = { run, child, log }
    this.runs.set(runId, handle)
    await this.writeSidecar(run)

    const onChunk = (buf: Buffer) => {
      const text = buf.toString("utf8")
      log.write(text)
      for (const line of text.split(/\r?\n/)) {
        const match = /^PROGRESS\s+(\d+)/.exec(line.trim())
        if (match?.[1] !== undefined) {
          run.pct = Math.min(100, Math.max(0, Number(match[1])))
        }
      }
    }
    child.stdout?.on("data", onChunk)
    child.stderr?.on("data", onChunk)

    const finalize = (status: AgentRun["status"]) => {
      run.status = status
      if (status === "done") run.pct = 100
      log.end()
      void this.writeSidecar(run)
    }
    child.on("error", () => finalize("error"))
    child.on("exit", (code) => finalize(code === 0 ? "done" : "error"))

    return run
  }

  /** Running runs, plus any finished within the retention window; newest first. */
  listRunning(): AgentRun[] {
    const cutoff = Date.now() - RETENTION_MS
    const out: AgentRun[] = []
    for (const [id, handle] of this.runs) {
      const finished = handle.run.status !== "running"
      // Drop long-finished runs from memory (their files stay on disk).
      if (finished && Date.parse(handle.run.startedAt) < cutoff) {
        this.runs.delete(id)
        continue
      }
      out.push(handle.run)
    }
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_LISTED)
  }

  get(runId: string): AgentRun {
    const handle = this.runs.get(runId)
    if (!handle) throw new RunNotFoundError(runId)
    return handle.run
  }

  stop(runId: string): AgentRun {
    const handle = this.runs.get(runId)
    if (!handle) throw new RunNotFoundError(runId)
    // No child → already finished or reconstructed from disk: nothing to kill.
    if (handle.child && handle.run.status === "running") handle.child.kill()
    return handle.run
  }

  /**
   * Read a run's log from `offset`. The log file is the source of truth, so this
   * works whether or not the run is still in the registry (durable replay). A
   * still-empty file for a live run yields an empty, not-done chunk.
   */
  async readLog(runId: string, offset: number): Promise<{
    content: string
    nextOffset: number
    done: boolean
  }> {
    const handle = this.runs.get(runId)
    const file = this.resolveLogFile(runId)

    let content = ""
    let size = offset
    try {
      const fd = await fs.open(file, "r")
      try {
        const stat = await fd.stat()
        size = stat.size
        if (offset < size) {
          const length = size - offset
          const buf = Buffer.alloc(length)
          await fd.read(buf, 0, length, offset)
          content = buf.toString("utf8")
        }
      } finally {
        await fd.close()
      }
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        // No file yet: fine for a live run, a 404 for an unknown one.
        if (handle) return { content: "", nextOffset: offset, done: false }
        throw new RunNotFoundError(runId)
      }
      throw error
    }

    const done = handle ? handle.run.status !== "running" : true
    return { content, nextOffset: size, done }
  }

  /** Build the command for a run. Demo by default; `claude -p` when opted in. */
  private buildCommand(prompt: string, cwd: string): { command: string; args: string[] } {
    if (process.env.AGENT_RUNNER_MODE === "claude") {
      return { command: "claude", args: ["-p", prompt] }
    }
    const script = process.env.AGENT_DEMO_SCRIPT ?? path.resolve(__dirname, "demo-task.mjs")
    return { command: process.execPath, args: [script, cwd] }
  }

  /** Persist a run's metadata next to its log so it survives a backend restart. */
  private async writeSidecar(run: AgentRun): Promise<void> {
    await fs
      .writeFile(path.join(this.dir, `${run.runId}.json`), JSON.stringify(run), "utf8")
      .catch(() => {
        // Best-effort: a failed sidecar write degrades restart fidelity, not the run.
      })
  }

  /** Last `PROGRESS <n>` seen in a log, or `fallback` if none/unreadable. */
  private async readLastProgress(logFile: string, fallback: number): Promise<number> {
    const content = await fs.readFile(logFile, "utf8").catch(() => null)
    if (content === null) return fallback
    let pct = fallback
    for (const line of content.split(/\r?\n/)) {
      const match = /^PROGRESS\s+(\d+)/.exec(line.trim())
      if (match?.[1] !== undefined) pct = Math.min(100, Math.max(0, Number(match[1])))
    }
    return pct
  }

  /**
   * Map a run id to its log file path *inside* the runs directory, rejecting any
   * id that could escape it — same defense-in-depth as the agents storage layer.
   */
  private resolveLogFile(runId: string): string {
    if (typeof runId !== "string" || !RUN_ID_REGEX.test(runId)) {
      throw new RunNotFoundError(runId)
    }
    const file = path.resolve(this.dir, `${runId}.log`)
    if (path.dirname(file) !== this.dir) {
      throw new RunNotFoundError(runId)
    }
    return file
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
