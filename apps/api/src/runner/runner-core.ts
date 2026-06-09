import { type ChildProcess, spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { type WriteStream, createWriteStream } from "node:fs"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { type IntendedAction, IntendedActionSchema } from "@zibby/contracts"
import { detectLimit } from "./detect-limit"
import type {
  BaseRun,
  KindStrategy,
  RunLogChunk,
  RunSpec,
  RunnerRunStatus,
} from "./runner-core.types"

/**
 * Called when a live run announces a mid-run action with an external effect (a
 * `INTENT {json}` line on stdout — Variant B). The handler evaluates the action
 * and steers the run via {@link RunnerCore.allowIntent} / {@link RunnerCore.denyIntent}
 * / {@link RunnerCore.holdForApproval}; the child blocks on a decision file until it
 * does. Wired by the agent runner (the core is entity-agnostic); other runners omit it.
 */
export type IntentHandler = (runId: string, action: IntendedAction, cwd: string) => void | Promise<void>

/** The decision file a paused child polls for, written into its sandbox `cwd`. */
const INTENT_DECISION_FILE = "intent-decision.json"

/**
 * The request file a real `claude -p` run's PreToolUse approval hook writes into the
 * coordination directory to announce a destructive action (the file-based equivalent
 * of the stdout `INTENT` line a demo child prints). {@link wire} watches that dir for
 * it and routes it through the same {@link IntentHandler}.
 */
const INTENT_REQUEST_FILE = "intent-request.json"

/**
 * Env var naming the directory the approval hook and the core exchange their
 * `intent-request.json` / `intent-decision.json` through. We set it explicitly to the
 * run's sandbox cwd on spawn rather than letting the hook guess from the Bash call's
 * own cwd — that cwd is the *granted target directory* (an `--add-dir` the agent
 * operates on), so the hook would otherwise drop the request where the core never
 * watches, stranding the gate. The hook reads this first (see claude-approval-hook.mjs).
 */
export const INTENT_DIR_ENV = "ZIBBY_INTENT_DIR"

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
  /** For an `awaiting-approval` run: the spec to spawn once it is approved. */
  pendingSpec?: RunSpec
  /**
   * Set when a run is being torn down on purpose (a denied / rejected mid-run
   * intent). The child exits non-zero in response, but its terminal state is
   * `interrupted`, not the `error` a non-zero exit normally means.
   */
  interrupting?: boolean
  /** Poll timer watching `cwd` for the hook's `intent-request.json` (Variant B). */
  intentTimer?: ReturnType<typeof setInterval>
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
 * to `interrupted`. An `awaiting-approval` run is reconciled by whether a spawn
 * spec was stashed: with one (a spawn-boundary pause via {@link createPending}) it
 * survives restart and can still be resumed once approved; without one (a Variant B
 * mid-run pause, whose blocking child died with the backend) there is nothing to
 * resume, so it is reconciled to `interrupted` like a dead `running` child.
 *
 * Variant B (mid-run gating): a live child may announce an external-effect action
 * via a `INTENT {json}` stdout line and then block on a decision file in its
 * sandbox. {@link wire} parses it and calls the {@link IntentHandler}, which steers
 * the run with {@link allowIntent} / {@link denyIntent} / {@link holdForApproval}.
 * A held run flips to `awaiting-approval` *without* killing its child; {@link resume}
 * (approve) writes an `allow` decision and the child proceeds, {@link cancel}
 * (reject) writes a `deny` and the child aborts.
 *
 * The class is deliberately a plain class, not a Nest provider: per-kind wrappers
 * own the DI surface and delegate here, so liveness/restart/approval logic lives
 * in exactly one place.
 */
export class RunnerCore<R extends BaseRun> {
  private readonly dir: string
  private readonly runs = new Map<string, RunHandle<R>>()

  constructor(
    dir: string,
    private readonly strategy: KindStrategy<R>,
    /**
     * Layer 2 of the limit tracker: called the first time a run's output carries a
     * usage-limit signal (with its reset epoch ms when the output named one). The
     * agent runner wires this to bust the limits cache; other runners omit it.
     */
    private readonly onLimitHit?: (resetsAt: number | null) => void,
    /**
     * Variant B mid-run gate: called when a live run emits an `INTENT {json}` line.
     * The agent runner wires this to the gate evaluator; other runners omit it (any
     * INTENT line then just falls through as ordinary, unhandled output).
     */
    private readonly onIntent?: IntentHandler,
  ) {
    this.dir = path.resolve(dir)
  }

  /** Rebuild the registry from disk so runs survive a backend restart. */
  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    const entries = await fs.readdir(this.dir).catch(() => [] as string[])
    for (const entry of entries) {
      if (!entry.endsWith(".json") || entry.endsWith(".pending.json")) continue
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
      if (run.status === "running") {
        // Phase 6: a run left "running" may be a live orphan that survived a hard
        // crash (kill -9 reparents a detached child to init). Probe its process
        // group before relabelling — if it's still alive, DON'T mark it
        // interrupted; reattach exit-detection via pgid polling instead.
        if (run.pgid && isAlive(run.pgid)) {
          const handle: RunHandle<R> = { run }
          this.runs.set(run.runId, handle)
          this.monitorPgid(handle)
          continue
        }
        run = {
          ...run,
          status: "interrupted",
          pct: await this.readLastProgress(run.logFile, run.pct),
        }
        await this.writeSidecar(run)
        this.runs.set(run.runId, { run })
      } else if (run.status === "awaiting-approval") {
        const pendingSpec = await this.readPendingSpec(run.runId)
        if (pendingSpec) {
          // Spawn-boundary pause: the stashed spec lets it resume after a restart.
          this.runs.set(run.runId, { run, pendingSpec })
        } else {
          // Variant B mid-run pause: its blocking child was a child of the previous
          // backend and died with it; nothing to resume → reconcile to interrupted.
          run = { ...run, status: "interrupted" }
          await this.writeSidecar(run)
          this.runs.set(run.runId, { run })
        }
      } else {
        this.runs.set(run.runId, { run })
      }
    }
  }

  /** Kill any still-live children (whole process group) on shutdown. */
  shutdown(): void {
    for (const handle of this.runs.values()) {
      // A run held at `awaiting-approval` (Variant B) still has a live child blocking
      // on its decision file — kill it too so we don't orphan a node process.
      const live = handle.run.status === "running" || handle.run.status === "awaiting-approval"
      if (handle.child && live) {
        // We are stopping the run, not failing it: flag it so the kill's non-zero
        // exit reconciles to `interrupted`, not `error`.
        handle.interrupting = true
        killGroup(handle.run.pgid ?? handle.run.pid)
      }
    }
  }

  /**
   * Spawn one run from `spec` into a fresh sandbox immediately (no gate). The
   * returned record is the live in-memory object — a wrapper may project it down
   * to its contract shape before returning to a client.
   */
  async start(spec: RunSpec): Promise<R> {
    const startedMs = spec.startedMs ?? Date.now()
    await fs.mkdir(this.dir, { recursive: true })
    await fs.mkdir(spec.cwd, { recursive: true })

    // `detached` puts the child in its own process group (pgid === pid on Linux),
    // so Phase 6 can probe/kill the whole group and an orphan survives a crash.
    // `stdin: "ignore"` (= `< /dev/null`) stops `claude -p` from waiting 3s for
    // piped input it will never get — its prompt arrives via `-p`, not stdin.
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      // Pin the gate's coordination dir to the sandbox so the hook writes its
      // request where {@link watchIntentRequest} watches — not into whatever
      // `--add-dir` target the destructive command happens to run in.
      env: { ...process.env, [INTENT_DIR_ENV]: spec.cwd },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const pid = child.pid ?? 0
    const runId = `${spec.ownerId}_${startedMs}_${pid}`
    const logFile = path.join(this.dir, `${runId}.log`)
    const log = createWriteStream(logFile, { flags: "a" })

    const base = this.baseRun(spec, runId, startedMs, pid, logFile)
    base.pgid = pid
    const run = this.strategy.assemble(base, spec)
    const handle: RunHandle<R> = { run, child, log }
    this.runs.set(runId, handle)
    await this.writeSidecar(run)
    this.wire(handle)
    return run
  }

  /**
   * Create a run in the `awaiting-approval` state WITHOUT spawning (Phase 3). The
   * spawn `spec` is stashed (in memory and on disk) so {@link resume} can start it
   * once a decision arrives — even across a restart.
   */
  async createPending(spec: RunSpec): Promise<R> {
    const startedMs = spec.startedMs ?? Date.now()
    await fs.mkdir(this.dir, { recursive: true })
    // No pid yet; a short random suffix keeps the id unique and filename-safe.
    const runId = `${spec.ownerId}_${startedMs}_p${randomBytes(3).toString("hex")}`
    const logFile = path.join(this.dir, `${runId}.log`)
    const base = this.baseRun(spec, runId, startedMs, 0, logFile)
    base.status = "awaiting-approval"
    const run = this.strategy.assemble(base, spec)
    this.runs.set(runId, { run, pendingSpec: spec })
    await this.writeSidecar(run)
    await this.writePendingSpec(runId, spec)
    return run
  }

  /**
   * Resume an approved `awaiting-approval` run. Two shapes:
   * - Variant B (a live child blocking on its decision file): write an `allow`
   *   decision and flip back to `running` — the child proceeds, we never respawn.
   * - Spawn-boundary pause (a stashed spec, no child): spawn the spec now.
   */
  async resume(runId: string): Promise<R> {
    const handle = this.runs.get(runId)
    if (!handle) throw new RunNotFoundError(runId)
    if (handle.run.status !== "awaiting-approval") return handle.run

    if (handle.child) {
      // Variant B: release the blocked child.
      await this.writeIntentDecision(handle.run.cwd, "allow")
      handle.run.status = "running"
      await this.writeSidecar(handle.run)
      return handle.run
    }

    if (!handle.pendingSpec) return handle.run

    const spec = handle.pendingSpec
    handle.pendingSpec = undefined
    await this.clearPendingSpec(runId)

    await fs.mkdir(spec.cwd, { recursive: true })
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      // Same coordination-dir pin as the initial spawn (see {@link start}).
      env: { ...process.env, [INTENT_DIR_ENV]: spec.cwd },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    handle.child = child
    handle.log = createWriteStream(handle.run.logFile, { flags: "a" })
    handle.run.pid = child.pid ?? 0
    handle.run.pgid = child.pid ?? 0
    handle.run.status = "running"
    await this.writeSidecar(handle.run)
    this.wire(handle)
    return handle.run
  }

  /**
   * Cancel a run. An `awaiting-approval` run is terminated WITHOUT performing its
   * action (reject path) → `interrupted`; a live run is killed.
   */
  cancel(runId: string): R {
    const handle = this.runs.get(runId)
    if (!handle) throw new RunNotFoundError(runId)
    if (handle.run.status === "awaiting-approval") {
      if (handle.child) {
        // Variant B: a live child is blocking on its decision file. Tell it to abort
        // (it exits non-zero); `interrupting` makes its exit reconcile to interrupted.
        // Then kill the group: a demo child exits on the `deny` itself, but a real
        // `claude` session may keep going (and could raise a *new* gate request via a
        // retried `rm`). Stop the watcher and the process so a cancelled run is truly
        // dead — no phantom approval on an already-rejected run.
        handle.interrupting = true
        void this.writeIntentDecision(handle.run.cwd, "deny")
        this.stopIntentWatch(handle)
        killGroup(handle.run.pgid ?? handle.run.pid)
      } else {
        // Spawn-boundary pause: it never spawned, so just mark it interrupted.
        void this.clearPendingSpec(runId)
      }
      handle.run.status = "interrupted"
      handle.pendingSpec = undefined
      void this.writeSidecar(handle.run)
    } else if (handle.child && handle.run.status === "running") {
      handle.child.kill()
    }
    return handle.run
  }

  /**
   * Variant B — let a mid-run intent through: write an `allow` decision so the
   * child unblocks and performs the action. The run stays `running`.
   */
  async allowIntent(runId: string): Promise<void> {
    const handle = this.runs.get(runId)
    if (!handle) return
    await this.writeIntentDecision(handle.run.cwd, "allow")
  }

  /**
   * Variant B — refuse a mid-run intent with no human in the loop: write a `deny`
   * decision (the child aborts, exiting non-zero) and flag the run so its exit
   * reconciles to `interrupted` rather than `error`.
   */
  async denyIntent(runId: string): Promise<void> {
    const handle = this.runs.get(runId)
    if (!handle) return
    handle.interrupting = true
    await this.writeIntentDecision(handle.run.cwd, "deny")
    // As with a reject: a real `claude` session won't necessarily exit on the deny,
    // so stop watching and kill the group to land on `interrupted` deterministically
    // and block any follow-up gate request from a retried destructive command.
    this.stopIntentWatch(handle)
    if (handle.child) killGroup(handle.run.pgid ?? handle.run.pid)
  }

  /**
   * Variant B — pause a live run on a mid-run intent: flip it to `awaiting-approval`
   * while its child keeps blocking on the (not-yet-written) decision file. A later
   * {@link resume}/{@link cancel} writes the decision that unblocks or aborts it.
   */
  async holdForApproval(runId: string): Promise<void> {
    const handle = this.runs.get(runId)
    if (!handle) return
    handle.run.status = "awaiting-approval"
    await this.writeSidecar(handle.run)
  }

  has(runId: string): boolean {
    return this.runs.has(runId)
  }

  /** Running runs, plus any finished within the retention window; newest first. */
  list(): R[] {
    const cutoff = Date.now() - RETENTION_MS
    const out: R[] = []
    for (const [id, handle] of this.runs) {
      const finished = handle.run.status === "done" || handle.run.status === "error"
      // Drop long-finished runs from memory (their files stay on disk). Keep
      // `awaiting-approval` (and `interrupted`) regardless of age.
      if (finished && Date.parse(handle.run.startedAt) < cutoff) {
        this.runs.delete(id)
        continue
      }
      out.push(handle.run)
    }
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_LISTED)
  }

  /**
   * Every run we can find — the full on-disk history (sidecars never deleted by the
   * retention sweep) overlaid with the in-memory copies (fresher `pct`/`status` for
   * a still-live run). No age cutoff and no cap: this backs the "all runs" history
   * view, whereas {@link list} backs the live panel. Newest first.
   */
  async listAll(): Promise<R[]> {
    const byId = new Map<string, R>()
    const entries = await fs.readdir(this.dir).catch(() => [] as string[])
    for (const entry of entries) {
      if (!entry.endsWith(".json") || entry.endsWith(".pending.json")) continue
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
      byId.set(parsed.data.runId, parsed.data)
    }
    // In-memory wins: a live run's pct only hits disk on a state transition.
    for (const [id, handle] of this.runs) byId.set(id, handle.run)
    return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  get(runId: string): R {
    const handle = this.runs.get(runId)
    if (!handle) throw new RunNotFoundError(runId)
    return handle.run
  }

  stop(runId: string): R {
    return this.cancel(runId)
  }

  /**
   * Permanently erase a run: kill a still-live child, drop it from the registry,
   * and remove its sidecar (`<runId>.json`), log (`<runId>.log`), any stashed
   * pending spec, and the sandbox folder it ran in. The sandbox path is taken from
   * memory or recovered from the sidecar, so a run only on disk (after the
   * retention sweep) is removed just as fully. Throws {@link RunNotFoundError} if no
   * trace of the run exists.
   */
  async delete(runId: string): Promise<void> {
    if (typeof runId !== "string" || !RUN_ID_REGEX.test(runId)) throw new RunNotFoundError(runId)
    const handle = this.runs.get(runId)
    const sidecar = this.resolveInDir(`${runId}.json`)

    let cwd = handle?.run.cwd
    let existed = handle !== undefined

    const raw = await fs.readFile(sidecar, "utf8").catch(() => null)
    if (raw !== null) {
      existed = true
      if (!cwd) {
        try {
          const parsed = this.strategy.schema.safeParse(JSON.parse(raw))
          if (parsed.success) cwd = parsed.data.cwd
        } catch {
          // Malformed sidecar: still delete the files, just can't recover the cwd.
        }
      }
    }

    if (!existed) throw new RunNotFoundError(runId)

    if (handle) {
      if (handle.child && handle.run.status === "running") killGroup(handle.run.pgid ?? handle.run.pid)
      handle.log?.end()
      this.runs.delete(runId)
    }

    await fs.rm(sidecar, { force: true }).catch(() => {})
    await fs.rm(this.resolveInDir(`${runId}.log`), { force: true }).catch(() => {})
    await fs.rm(this.resolveInDir(`${runId}.pending.json`), { force: true }).catch(() => {})
    if (cwd && this.isInsideDir(cwd)) {
      await fs.rm(cwd, { recursive: true, force: true }).catch(() => {})
    }
  }

  /**
   * Read a run's log from `offset`. The log file is the source of truth, so this
   * works whether or not the run is still in the registry (durable replay). A
   * still-empty file for a live (or pending) run yields an empty, not-done chunk.
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
        if (handle) return { content: "", nextOffset: offset, done: false }
        throw new RunNotFoundError(runId)
      }
      throw error
    }

    const done = handle ? handle.run.status === "done" || handle.run.status === "error" : true
    return { content, nextOffset: size, done }
  }

  /** Build the kind-agnostic base fields for a run record. */
  private baseRun(
    spec: RunSpec,
    runId: string,
    startedMs: number,
    pid: number,
    logFile: string,
  ): BaseRun {
    return {
      runId,
      kind: spec.kind,
      status: "running",
      pct: 0,
      cwd: spec.cwd,
      startedAt: new Date(startedMs).toISOString(),
      pid,
      logFile,
    }
  }

  /**
   * Reattach exit-detection to a reconstructed orphan: we can't re-pipe its stdout
   * (the previous process owned the stream), so we poll its process group and
   * finalize when it dies — done if it reached 100%, else interrupted.
   */
  private monitorPgid(handle: RunHandle<R>): void {
    const pgid = handle.run.pgid ?? handle.run.pid
    if (!pgid) return
    const timer = setInterval(() => {
      if (isAlive(pgid)) return
      clearInterval(timer)
      void this.readLastProgress(handle.run.logFile, handle.run.pct).then((pct) => {
        handle.run.pct = pct
        handle.run.status = pct >= 100 ? "done" : "interrupted"
        void this.writeSidecar(handle.run)
      })
    }, 200)
    timer.unref?.()
  }

  /** Attach output capture + exit handling to a live handle. */
  private wire(handle: RunHandle<R>): void {
    const { child, log, run } = handle
    if (!child || !log) return

    let limitSeen = false
    // Buffer partial lines across chunks: a control line (PROGRESS / INTENT) split
    // over a chunk boundary must still be parsed whole — a missed INTENT would
    // strand the child blocking on its decision file until the 10-minute timeout.
    let residual = ""
    const onChunk = (buf: Buffer) => {
      const text = buf.toString("utf8")
      log.write(text)
      residual += text
      const lines = residual.split(/\r?\n/)
      residual = lines.pop() ?? ""
      for (const raw of lines) {
        const line = raw.trim()
        const progress = /^PROGRESS\s+(\d+)/.exec(line)
        if (progress?.[1] !== undefined) {
          run.pct = Math.min(100, Math.max(0, Number(progress[1])))
          continue
        }
        // Variant B: the child announced an external-effect action and is now
        // blocking on its decision file. Parse it as an IntendedAction and hand it
        // to the gate (which writes the file). A malformed line is ignored.
        const intent = /^INTENT\s+(\{.*\})$/.exec(line)
        if (intent?.[1] && this.onIntent) {
          let action: IntendedAction | undefined
          try {
            const parsed = IntendedActionSchema.safeParse(JSON.parse(intent[1]))
            if (parsed.success) action = parsed.data
          } catch {
            // Not JSON / not an IntendedAction — leave it as ordinary output.
          }
          if (action) void this.onIntent(run.runId, action, run.cwd)
        }
      }
      // Layer 2: a usage-limit signal in the output busts the limits cache (once).
      if (!limitSeen && this.onLimitHit) {
        const { hit, resetsAt } = detectLimit(text)
        if (hit) {
          limitSeen = true
          this.onLimitHit(resetsAt)
        }
      }
    }
    child.stdout?.on("data", onChunk)
    child.stderr?.on("data", onChunk)

    // Variant B (real claude): the gate is a PreToolUse hook that writes an
    // `intent-request.json` into the sandbox rather than printing an INTENT line
    // (a hook's stdout never reaches this pipe). Watch for it alongside the stdout
    // path so both demo and real runs route through the same {@link IntentHandler}.
    this.watchIntentRequest(handle)

    const finalize = (status: RunnerRunStatus) => {
      run.status = status
      if (status === "done") run.pct = 100
      this.stopIntentWatch(handle)
      log.end()
      void this.writeSidecar(run)
    }
    child.on("error", () => finalize("error"))
    child.on("exit", (code) => {
      // A run torn down on purpose (denied / rejected mid-run intent) exits non-zero
      // but its terminal state is `interrupted`, not `error`.
      if (handle.interrupting) return finalize("interrupted")
      finalize(code === 0 ? "done" : "error")
    })
  }

  /**
   * Poll a live run's sandbox `cwd` for the approval hook's `intent-request.json`.
   * On appearance: consume it, parse it as an {@link IntendedAction}, and hand it to
   * the {@link IntentHandler} — the same path the stdout `INTENT` line takes. The
   * handler then writes the decision via {@link writeIntentDecision} (into `cwd`),
   * which the blocking hook polls for. Removing the request file lets a later
   * destructive command in the same run raise a fresh request.
   */
  private watchIntentRequest(handle: RunHandle<R>): void {
    if (!this.onIntent) return
    const reqFile = path.join(handle.run.cwd, INTENT_REQUEST_FILE)
    const timer = setInterval(() => {
      void fs
        .readFile(reqFile, "utf8")
        .then(async (raw) => {
          await fs.rm(reqFile, { force: true }).catch(() => {})
          let action: IntendedAction | undefined
          try {
            const parsed = IntendedActionSchema.safeParse(JSON.parse(raw))
            if (parsed.success) action = parsed.data
          } catch {
            // Malformed request → ignore; the hook will time out to a safe deny.
          }
          if (action) await this.onIntent?.(handle.run.runId, action, handle.run.cwd)
        })
        .catch(() => {
          // No request file yet (ENOENT) — the common case between polls.
        })
    }, 200)
    timer.unref?.()
    handle.intentTimer = timer
  }

  /** Stop the intent-request watcher for a run (on terminal status / teardown). */
  private stopIntentWatch(handle: RunHandle<R>): void {
    if (handle.intentTimer) {
      clearInterval(handle.intentTimer)
      handle.intentTimer = undefined
    }
  }

  /** Persist a run's metadata next to its log so it survives a backend restart. */
  private async writeSidecar(run: R): Promise<void> {
    await fs
      .writeFile(path.join(this.dir, `${run.runId}.json`), JSON.stringify(run), "utf8")
      .catch(() => {})
  }

  /** Write the decision a Variant B child is polling for, into its sandbox `cwd`. */
  private async writeIntentDecision(cwd: string, decision: "allow" | "deny"): Promise<void> {
    await fs
      .writeFile(path.join(cwd, INTENT_DECISION_FILE), JSON.stringify({ decision }), "utf8")
      .catch(() => {})
  }

  private async writePendingSpec(runId: string, spec: RunSpec): Promise<void> {
    await fs
      .writeFile(path.join(this.dir, `${runId}.pending.json`), JSON.stringify(spec), "utf8")
      .catch(() => {})
  }

  private async readPendingSpec(runId: string): Promise<RunSpec | undefined> {
    const raw = await fs
      .readFile(path.join(this.dir, `${runId}.pending.json`), "utf8")
      .catch(() => null)
    if (raw === null) return undefined
    try {
      return JSON.parse(raw) as RunSpec
    } catch {
      return undefined
    }
  }

  private async clearPendingSpec(runId: string): Promise<void> {
    await fs.rm(path.join(this.dir, `${runId}.pending.json`), { force: true }).catch(() => {})
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

  /** Resolve a sidecar file name directly inside the runs dir, rejecting escapes. */
  private resolveInDir(name: string): string {
    const file = path.resolve(this.dir, name)
    if (path.dirname(file) !== this.dir) throw new RunNotFoundError(name)
    return file
  }

  /** Is `target` the runs dir itself or a path nested inside it? (rm guard) */
  private isInsideDir(target: string): boolean {
    const resolved = path.resolve(target)
    return resolved === this.dir || resolved.startsWith(this.dir + path.sep)
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

/** Is a process (group leader) still alive? `kill(pid, 0)` probes without signalling. */
function isAlive(pid: number): boolean {
  if (!pid || pid <= 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // ESRCH = no such process; EPERM = exists but not ours (still "alive").
    return isErrnoException(error) && error.code === "EPERM"
  }
}

/** Terminate a whole detached process group (negative pid targets the group). */
function killGroup(pgid: number): void {
  if (!pgid || pgid <= 1) return
  try {
    process.kill(-pgid, "SIGTERM")
  } catch {
    try {
      process.kill(pgid, "SIGTERM")
    } catch {
      // Already gone.
    }
  }
}
