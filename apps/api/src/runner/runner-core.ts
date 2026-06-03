import { type ChildProcess, spawn } from "node:child_process"
import { type WriteStream, createWriteStream } from "node:fs"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import type {
  BaseRun,
  KindStrategy,
  RunLogChunk,
  RunSpec,
  RunnerRunStatus,
} from "./runner-core.types"

/** A run id may only contain the safe characters our filenames are built from. */
const RUN_ID_REGEX = /^[a-zA-Z0-9._-]+$/

/** Finished runs stay in the list (and in memory) for this long after they start. */
const RETENTION_MS = 30 * 60 * 1000

/** Hard cap on how many runs the list returns, newest first. */
const MAX_LISTED = 50

/** Thrown when a run id is unknown or unsafe — controllers map it to a 404. */
export class RunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Run "${runId}" not found`)
    this.name = "RunNotFoundError"
  }
}

interface RunHandle<R extends BaseRun> {
  run: R
  /** The live process, when this run was started in *this* backend process. A run
   * reconstructed from disk after a restart has no child (it cannot be resumed). */
  child?: ChildProcess
  log?: WriteStream
}

/**
 * The shared execution engine behind every run kind. Spawns a child process into
 * a per-run sandbox, captures its output to a `<runId>.log`, and persists the
 * run's metadata to a `<runId>.json` sidecar — the two together survive both a
 * frontend reload and a backend restart.
 *
 * On {@link init} the registry is rebuilt from the sidecars on disk. A sidecar
 * still marked `running` means its process died with the previous backend (the
 * child is a child of the API process); it can't be resumed, so it is reconciled
 * to `interrupted`. A run paused at `awaiting-approval` has no live child *by
 * design* — Phase 3 — so it survives restart unchanged.
 *
 * The class is deliberately a plain class, not a Nest provider: per-kind wrappers
 * (`AgentRunnerService`, `SkillRunnerService`, `PipelineRunnerService`) own the DI
 * surface and delegate here, so liveness/restart/approval logic lives in exactly
 * one place.
 */
export class RunnerCore<R extends BaseRun> {
  private readonly dir: string
  private readonly runs = new Map<string, RunHandle<R>>()

  constructor(
    dir: string,
    private readonly strategy: KindStrategy<R>,
  ) {
    this.dir = path.resolve(dir)
  }

  /** Rebuild the registry from disk so runs survive a backend restart. */
  async init(): Promise<void> {
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
      const parsed = this.strategy.schema.safeParse(data)
      if (!parsed.success) continue
      let run = parsed.data
      // A run left "running" in a sidecar can't be live in this fresh process. A
      // run paused at "awaiting-approval" expectedly has no child — leave it be.
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
  shutdown(): void {
    for (const handle of this.runs.values()) {
      if (handle.child && handle.run.status === "running") handle.child.kill()
    }
  }

  /**
   * Spawn one run from `spec` into a fresh sandbox, wiring its output to a log file
   * plus a metadata sidecar. The returned record is the live in-memory object — a
   * wrapper may project it down to its contract shape before returning to a client.
   */
  async start(spec: RunSpec): Promise<R> {
    const startedMs = spec.startedMs ?? Date.now()
    await fs.mkdir(this.dir, { recursive: true })
    await fs.mkdir(spec.cwd, { recursive: true })

    const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env: process.env })

    // `child.pid` is set synchronously, and listeners attached now (before the
    // next tick) cannot miss any output — so no early lines are lost.
    const pid = child.pid ?? 0
    const runId = `${spec.ownerId}_${startedMs}_${pid}`
    const logFile = path.join(this.dir, `${runId}.log`)
    const log = createWriteStream(logFile, { flags: "a" })

    const base: BaseRun = {
      runId,
      kind: spec.kind,
      status: "running",
      pct: 0,
      cwd: spec.cwd,
      startedAt: new Date(startedMs).toISOString(),
      pid,
      logFile,
    }
    const run = this.strategy.assemble(base, spec)
    const handle: RunHandle<R> = { run, child, log }
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

    const finalize = (status: RunnerRunStatus) => {
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
  list(): R[] {
    const cutoff = Date.now() - RETENTION_MS
    const out: R[] = []
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

  get(runId: string): R {
    const handle = this.runs.get(runId)
    if (!handle) throw new RunNotFoundError(runId)
    return handle.run
  }

  stop(runId: string): R {
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
  async readLog(runId: string, offset: number): Promise<RunLogChunk> {
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

  /** Persist a run's metadata next to its log so it survives a backend restart. */
  private async writeSidecar(run: R): Promise<void> {
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
   * id that could escape it — same defense-in-depth as the storage layer.
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
