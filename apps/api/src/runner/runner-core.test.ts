import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { IntendedAction } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { formatClaudeStreamLine } from "./claude-stream-format";
import { INTENT_DIR_ENV, MAX_LOG_READ_BYTES, RunNotFoundError, RunnerCore } from "./runner-core";
import type { BaseRun, KindStrategy } from "./runner-core.types";

// A minimal record + strategy mirroring how a real wrapper plugs into the core.
// `kind` defaults so a sidecar written before the field existed still parses.
const TestRecordSchema = z.object({
  runId: z.string(),
  kind: z.literal("agent").default("agent"),
  status: z.enum(["running", "done", "error", "interrupted", "awaiting-approval", "paused-limit"]),
  pct: z.number(),
  cwd: z.string(),
  startedAt: z.string(),
  pid: z.number(),
  logFile: z.string(),
  pgid: z.number().int().optional(),
  resumeAt: z.number().int().nullable().optional(),
  limitResumeCycles: z.number().int().nonnegative().optional(),
  label: z.string().default(""),
});
type TestRecord = z.infer<typeof TestRecordSchema> & BaseRun;

const strategy: KindStrategy<TestRecord> = {
  schema: TestRecordSchema,
  assemble(base, spec) {
    return { ...base, kind: "agent", label: String(spec.extra.label ?? "") };
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NODE = process.execPath;

/** `process.kill(pid, 0)` probes liveness without signalling. */
function isProcAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A tiny inline child that prints a PROGRESS line then exits 0. */
function progressScript(pct: number): string[] {
  return ["-e", `console.log("PROGRESS ${pct}"); process.exit(0)`];
}

/**
 * A child that announces a mid-run INTENT (Variant B) then blocks polling its
 * sandbox for `intent-decision.json`: on `allow` it finishes 0, otherwise exits 1.
 */
function intentScript(cwd: string): string[] {
  const body = `const fs=require("node:fs");const p=require("node:path");const f=p.join(${JSON.stringify(
    cwd,
  )},"intent-decision.json");console.log("PROGRESS 10");process.stdout.write('INTENT {"action":"payment","metrics":{"purchase.amount":1200}}\\n');const t=setInterval(()=>{let r;try{r=fs.readFileSync(f,"utf8")}catch{return}clearInterval(t);let d;try{d=JSON.parse(r).decision}catch{d="deny"}if(d!=="allow")process.exit(1);console.log("PROGRESS 100");process.exit(0)},50)`;
  return ["-e", body];
}

/**
 * A child that announces its intent the *real-claude* way: it writes
 * `intent-request.json` into its cwd (as the PreToolUse hook would) instead of
 * printing an INTENT line, then blocks polling `intent-decision.json`.
 */
function fileIntentScript(cwd: string): string[] {
  const req = JSON.stringify(path.join(cwd, "intent-request.json"));
  const dec = JSON.stringify(path.join(cwd, "intent-decision.json"));
  const body = `const fs=require("node:fs");console.log("PROGRESS 10");fs.writeFileSync(${req},JSON.stringify({action:"payment",metrics:{"purchase.amount":1200}}));const t=setInterval(()=>{let r;try{r=fs.readFileSync(${dec},"utf8")}catch{return}clearInterval(t);let d;try{d=JSON.parse(r).decision}catch{d="deny"}if(d!=="allow")process.exit(1);console.log("PROGRESS 100");process.exit(0)},50)`;
  return ["-e", body];
}

/** Poll the in-memory run until it reaches `status`, or throw on timeout. */
async function waitForStatus(
  core: RunnerCore<TestRecord>,
  runId: string,
  status: string,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (core.get(runId).status === status) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `waitForStatus: ${runId} never reached ${status} (now ${core.get(runId).status})`,
      );
    }
    await sleep(20);
  }
}

describe("RunnerCore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "runner-core-"));
  });
  afterEach(async () => {
    // Tests spawn real detached children into `dir`; one may still be finalizing its
    // exit (flushing the log, releasing the sandbox) when cleanup runs, which races
    // the recursive remove to `ENOTEMPTY`. `maxRetries`/`retryDelay` is Node's
    // built-in remedy for exactly that transient on `fs.rm`.
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("spawns a child, captures the log, and reaches done with pct 100", async () => {
    const core = new RunnerCore(dir, strategy);
    await core.init();
    const run = await core.start({
      kind: "agent",
      ownerId: "agent-007",
      command: NODE,
      args: progressScript(55),
      cwd: path.join(dir, "agent-007_sandbox"),
      extra: { label: "hello" },
    });
    expect(run.runId.startsWith("agent-007_")).toBe(true);
    expect(run.label).toBe("hello");

    // Poll the log until the run reports done.
    let offset = 0;
    let log = "";
    for (let i = 0; i < 100; i++) {
      const chunk = await core.readLog(run.runId, offset);
      log += chunk.content;
      offset = chunk.nextOffset;
      if (chunk.done) break;
      await sleep(20);
    }
    expect(log).toContain("PROGRESS 55");
    expect(core.get(run.runId).status).toBe("done");
    expect(core.get(run.runId).pct).toBe(100);
  });

  it("spreads spec.env into the child process (per-project env/secrets seam)", async () => {
    const core = new RunnerCore(dir, strategy);
    await core.init();
    const run = await core.start({
      kind: "agent",
      ownerId: "agent-env",
      command: NODE,
      args: ["-e", "console.log('ENV ' + process.env.ZIBBY_TEST_SECRET); process.exit(0)"],
      cwd: path.join(dir, "agent-env_sandbox"),
      env: { ZIBBY_TEST_SECRET: "from-project" },
      extra: { label: "env" },
    });
    let offset = 0;
    let log = "";
    for (let i = 0; i < 100; i++) {
      const chunk = await core.readLog(run.runId, offset);
      log += chunk.content;
      offset = chunk.nextOffset;
      if (chunk.done) break;
      await sleep(20);
    }
    expect(log).toContain("ENV from-project");
  });

  it("never lets spec.env override the ZIBBY-owned intent-dir pin", async () => {
    const core = new RunnerCore(dir, strategy);
    await core.init();
    const sandbox = path.join(dir, "agent-pin_sandbox");
    const run = await core.start({
      kind: "agent",
      ownerId: "agent-pin",
      command: NODE,
      args: ["-e", `console.log('PIN ' + process.env.${INTENT_DIR_ENV}); process.exit(0)`],
      cwd: sandbox,
      // A hostile/clumsy project env must NOT be able to repoint the gate dir.
      env: { [INTENT_DIR_ENV]: "/tmp/evil" },
      extra: { label: "pin" },
    });
    let offset = 0;
    let log = "";
    for (let i = 0; i < 100; i++) {
      const chunk = await core.readLog(run.runId, offset);
      log += chunk.content;
      offset = chunk.nextOffset;
      if (chunk.done) break;
      await sleep(20);
    }
    expect(log).toContain(`PIN ${sandbox}`);
    expect(log).not.toContain("/tmp/evil");
  });

  it("shutdown() kills a live child, awaits its exit + log flush, and resolves (12.9)", async () => {
    const core = new RunnerCore(dir, strategy);
    await core.init();
    const run = await core.start({
      kind: "agent",
      ownerId: "agent-longrun",
      command: NODE,
      // Print a line (so the log has content to flush) then run forever.
      args: ["-e", "console.log('PROGRESS 1'); setInterval(() => {}, 1000)"],
      cwd: path.join(dir, "agent-longrun_sandbox"),
      extra: { label: "long" },
    });
    await waitForStatus(core, run.runId, "running");
    const { pid } = core.get(run.runId);
    expect(isProcAlive(pid)).toBe(true);

    const before = Date.now();
    await core.shutdown();
    // Resolves promptly — well under the 5s grace, since a plain node child dies on SIGTERM.
    expect(Date.now() - before).toBeLessThan(4000);
    // The child is reaped and the run reconciled to `interrupted` (deliberate teardown).
    expect(isProcAlive(pid)).toBe(false);
    expect(core.get(run.runId).status).toBe("interrupted");
  });

  it("emits status transitions and log-append signals to subscribers (SSE push)", async () => {
    const core = new RunnerCore(dir, strategy);
    await core.init();
    // Subscribe before start so the first `running` transition is captured.
    const statuses: string[] = [];
    const offStatus = core.onStatus((r) => statuses.push(r.status));

    // A child that delays its first output, so we can attach the log listener after
    // start() and still reliably observe an append (plus the finalize flush).
    const run = await core.start({
      kind: "agent",
      ownerId: "emit",
      command: NODE,
      args: [
        "-e",
        'setTimeout(()=>{console.log("PROGRESS 50");setTimeout(()=>{console.log("PROGRESS 100");process.exit(0)},60)},60)',
      ],
      cwd: path.join(dir, "emit_sandbox"),
      extra: { label: "x" },
    });
    let logSignals = 0;
    const offLog = core.onLog(run.runId, () => {
      logSignals++;
    });

    await waitForStatus(core, run.runId, "done");
    // Let the finalize end-callback (final log flush signal) fire.
    await sleep(80);
    offStatus();
    offLog();

    expect(statuses[0]).toBe("running");
    expect(statuses).toContain("done");
    expect(logSignals).toBeGreaterThan(0);
  });

  it("flattens stream-json output through formatLine while leaving control lines intact", async () => {
    // With a formatter attached (the agent runner wires the stream-json flattener),
    // JSON events become readable log text; a bare PROGRESS line still drives pct.
    const core = new RunnerCore(
      dir,
      strategy,
      undefined,
      undefined,
      undefined,
      formatClaudeStreamLine,
    );
    await core.init();
    const event =
      '{"type":"assistant","message":{"content":[{"type":"text","text":"hello world"}]}}';
    const run = await core.start({
      kind: "agent",
      ownerId: "fmt",
      command: NODE,
      args: [
        "-e",
        `console.log(${JSON.stringify(event)});console.log("PROGRESS 100");process.exit(0)`,
      ],
      cwd: path.join(dir, "fmt_sandbox"),
      extra: { label: "x" },
    });

    let offset = 0;
    let log = "";
    for (let i = 0; i < 100; i++) {
      const chunk = await core.readLog(run.runId, offset);
      log += chunk.content;
      offset = chunk.nextOffset;
      if (chunk.done) break;
      await sleep(20);
    }
    // The assistant event is flattened to its text; the raw JSON never reaches the log.
    expect(log).toContain("hello world");
    expect(log).not.toContain('"type":"assistant"');
    // The bare control line passed through unchanged and still moved pct to 100.
    expect(core.get(run.runId).status).toBe("done");
    expect(core.get(run.runId).pct).toBe(100);
  });

  it("spawns the child with the gate coordination dir pinned to its sandbox", async () => {
    // Regression: the approval hook must exchange its request/decision files in the
    // sandbox the core watches — not the granted target the destructive command runs
    // in. The core advertises that sandbox to the child via `ZIBBY_INTENT_DIR`.
    const core = new RunnerCore(dir, strategy);
    await core.init();
    const cwd = path.join(dir, "env_sandbox");
    const run = await core.start({
      kind: "agent",
      ownerId: "envp",
      command: NODE,
      args: ["-e", `console.log("DIR=" + process.env.${INTENT_DIR_ENV}); process.exit(0)`],
      cwd,
      extra: { label: "x" },
    });

    let log = "";
    for (let i = 0; i < 100; i++) {
      const chunk = await core.readLog(run.runId, 0);
      log = chunk.content;
      if (chunk.done) break;
      await sleep(20);
    }
    expect(log).toContain(`DIR=${cwd}`);
  });

  it("caps each readLog to MAX_LOG_READ_BYTES so a huge log never OOMs the process", async () => {
    // A runaway child can write a multi-hundred-MB log; reading `offset..EOF` in one
    // `Buffer.alloc` + `toString` of the whole tail crashed the heap. Read must chunk.
    const core = new RunnerCore(dir, strategy);
    await core.init();

    // Durable-replay path: a bare `<runId>.log` on disk (no live handle) is read as a
    // finished run. Make it span 2.5 chunks so the cap forces ≥3 reads.
    const runId = "biglog_1700000000000_4242";
    const total = MAX_LOG_READ_BYTES * 2 + MAX_LOG_READ_BYTES / 2;
    // A repeating, ASCII (1 byte/char) pattern — byte offset == char offset, so the
    // cap boundary can't split a multibyte char and the reassembly is exact.
    const pattern = "zibby-runaway-log-0123456789-";
    const payload = pattern.repeat(Math.ceil(total / pattern.length)).slice(0, total);
    await fs.writeFile(path.join(dir, `${runId}.log`), payload, "utf8");

    // First read is capped, not the whole file, and NOT done (bytes remain past it).
    const first = await core.readLog(runId, 0);
    expect(first.content.length).toBe(MAX_LOG_READ_BYTES);
    expect(first.nextOffset).toBe(MAX_LOG_READ_BYTES);
    expect(first.done).toBe(false);

    // Draining via the nextOffset loop reassembles the file byte-for-byte and ends done.
    let offset = 0;
    let reassembled = "";
    let reads = 0;
    for (;;) {
      const chunk = await core.readLog(runId, offset);
      reassembled += chunk.content;
      offset = chunk.nextOffset;
      reads += 1;
      if (chunk.done) break;
      if (reads > 100) throw new Error("readLog never reported done");
    }
    expect(reads).toBeGreaterThanOrEqual(3); // 2.5 chunks ⇒ at least three reads
    expect(reassembled).toBe(payload);
  });

  it("throws RunNotFoundError for an unknown or unsafe run id", async () => {
    const core = new RunnerCore(dir, strategy);
    await core.init();
    await expect(core.readLog("../escape", 0)).rejects.toBeInstanceOf(RunNotFoundError);
    expect(() => core.get("nope")).toThrow(RunNotFoundError);
    await expect(core.delete("../escape")).rejects.toBeInstanceOf(RunNotFoundError);
    await expect(core.delete("nope")).rejects.toBeInstanceOf(RunNotFoundError);
  });

  it("listAll surfaces finished runs beyond the live retention window", async () => {
    // A long-finished run: dropped from the live `list()` (retention) but still
    // present in the full history `listAll()` reads off disk.
    const runId = "old_1700000000000_7";
    const logFile = path.join(dir, `${runId}.log`);
    await fs.writeFile(logFile, "PROGRESS 100\n", "utf8");
    await fs.writeFile(
      path.join(dir, `${runId}.json`),
      JSON.stringify({
        runId,
        kind: "agent",
        status: "done",
        pct: 100,
        cwd: path.join(dir, "old"),
        startedAt: new Date(1700000000000).toISOString(),
        pid: 7,
        logFile,
        label: "ancient",
      }),
      "utf8",
    );

    const core = new RunnerCore(dir, strategy);
    await core.init();
    expect(core.list().some((r) => r.runId === runId)).toBe(false);
    const found = (await core.listAll()).find((r) => r.runId === runId);
    expect(found?.status).toBe("done");
    expect(found?.label).toBe("ancient");
  });

  it("delete erases a run's sidecar, log, and sandbox, then 404s", async () => {
    const core = new RunnerCore(dir, strategy);
    await core.init();
    const sandbox = path.join(dir, "doomed_sandbox");
    const run = await core.start({
      kind: "agent",
      ownerId: "doomed",
      command: NODE,
      args: progressScript(100),
      cwd: sandbox,
      extra: { label: "x" },
    });
    // Let it finish so no child is writing the log as we delete.
    for (let i = 0; i < 100; i++) {
      if ((await core.readLog(run.runId, 0)).done) break;
      await sleep(20);
    }
    await fs.writeFile(path.join(sandbox, "artifact.txt"), "out", "utf8");

    await core.delete(run.runId);

    expect(() => core.get(run.runId)).toThrow(RunNotFoundError);
    await expect(fs.access(path.join(dir, `${run.runId}.json`))).rejects.toThrow();
    await expect(fs.access(path.join(dir, `${run.runId}.log`))).rejects.toThrow();
    await expect(fs.access(sandbox)).rejects.toThrow();
    // Now truly gone: a second delete is a not-found.
    await expect(core.delete(run.runId)).rejects.toBeInstanceOf(RunNotFoundError);
  });

  it("delete removes a run that exists only on disk (recovers cwd from sidecar)", async () => {
    const runId = "disk_1700000000000_3";
    const sandbox = path.join(dir, "disk_sandbox");
    await fs.mkdir(sandbox, { recursive: true });
    await fs.writeFile(path.join(sandbox, "f.txt"), "x", "utf8");
    await fs.writeFile(path.join(dir, `${runId}.log`), "PROGRESS 100\n", "utf8");
    await fs.writeFile(
      path.join(dir, `${runId}.json`),
      JSON.stringify({
        runId,
        kind: "agent",
        status: "done",
        pct: 100,
        cwd: sandbox,
        startedAt: new Date(1700000000000).toISOString(),
        pid: 3,
        logFile: path.join(dir, `${runId}.log`),
        label: "",
      }),
      "utf8",
    );

    // A fresh core that never loaded this run into memory: cwd must come from the
    // sidecar so the sandbox is still removed.
    const core = new RunnerCore(dir, strategy);
    await core.delete(runId);
    await expect(fs.access(path.join(dir, `${runId}.json`))).rejects.toThrow();
    await expect(fs.access(sandbox)).rejects.toThrow();
  });

  it("reconstructs an old-format sidecar with NO `kind` field as interrupted", async () => {
    // The crucial back-compat guard: a sidecar written before `kind` existed must
    // still parse (kind defaults), and a 'running' one with no live child must be
    // reconciled to 'interrupted' with its last logged progress.
    const runId = "ghost_1780000000000_4242";
    const logFile = path.join(dir, `${runId}.log`);
    await fs.writeFile(logFile, "starting up\nPROGRESS 40\n", "utf8");
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
    );

    const core = new RunnerCore(dir, strategy);
    await core.init();
    const found = core.list().find((r) => r.runId === runId);
    expect(found?.status).toBe("interrupted");
    expect(found?.pct).toBe(40);
    expect(found?.kind).toBe("agent");
  });

  it("does NOT relabel a still-alive orphan to interrupted on restart (pgid)", async () => {
    // core1 starts a long sleeper in its own process group, then "crashes"
    // (we never call shutdown) leaving the detached child alive.
    const core1 = new RunnerCore(dir, strategy);
    await core1.init();
    const run = await core1.start({
      kind: "agent",
      ownerId: "sleeper",
      command: NODE,
      args: ["-e", "setTimeout(() => process.exit(0), 4000)"],
      cwd: path.join(dir, "sleeper"),
      extra: { label: "x" },
    });
    const pgid = run.pgid;
    expect(pgid).toBeGreaterThan(0);

    // Restart: a fresh core over the same dir. The sidecar says "running"; the
    // process group is still alive → it must stay running, not be reconciled.
    const core2 = new RunnerCore(dir, strategy);
    await core2.init();
    expect(core2.get(run.runId).status).toBe("running");

    // Clean up the orphan group.
    try {
      if (pgid) process.kill(-pgid, "SIGKILL");
    } catch {
      /* already gone */
    }
    core1.shutdown();
  });

  it("handles many concurrent runs without corrupting state", async () => {
    const core = new RunnerCore(dir, strategy);
    await core.init();
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
    );
    // All ids are distinct and individually retrievable.
    const ids = new Set(runs.map((r) => r.runId));
    expect(ids.size).toBe(8);
    for (const r of runs) expect(core.get(r.runId).runId).toBe(r.runId);

    // Concurrent log reads don't throw, and every sidecar parses back.
    await Promise.all(runs.map((r) => core.readLog(r.runId, 0)));
    await sleep(150);
    for (const r of runs) {
      const raw = await fs.readFile(path.join(dir, `${r.runId}.json`), "utf8");
      expect(TestRecordSchema.safeParse(JSON.parse(raw)).success).toBe(true);
    }
  });

  it("keeps an awaiting-approval run with a stashed spec across restart", async () => {
    // A spawn-boundary pause persists its spawn spec → it can still resume after a
    // restart, so init() leaves it awaiting-approval.
    const runId = "paused_1780000000000_99";
    await fs.writeFile(path.join(dir, `${runId}.log`), "waiting\n", "utf8");
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
    );
    await fs.writeFile(
      path.join(dir, `${runId}.pending.json`),
      JSON.stringify({
        kind: "agent",
        ownerId: "paused",
        command: NODE,
        args: progressScript(100),
        cwd: path.join(dir, "paused"),
        extra: { label: "x" },
      }),
      "utf8",
    );

    const core = new RunnerCore(dir, strategy);
    await core.init();
    const found = core.list().find((r) => r.runId === runId);
    expect(found?.status).toBe("awaiting-approval");
  });

  it("reconciles a mid-run (Variant B) awaiting-approval orphan to interrupted on restart", async () => {
    // A Variant B pause has NO stashed spec — its blocking child died with the
    // previous backend, so there is nothing to resume → it becomes interrupted.
    const runId = "midrun_1780000000000_77";
    await fs.writeFile(path.join(dir, `${runId}.log`), "waiting\n", "utf8");
    await fs.writeFile(
      path.join(dir, `${runId}.json`),
      JSON.stringify({
        runId,
        kind: "agent",
        status: "awaiting-approval",
        pct: 33,
        cwd: path.join(dir, "midrun"),
        startedAt: new Date().toISOString(),
        pid: 77,
        logFile: path.join(dir, `${runId}.log`),
      }),
      "utf8",
    );

    const core = new RunnerCore(dir, strategy);
    await core.init();
    expect(core.get(runId).status).toBe("interrupted");
  });

  it("allows a mid-run INTENT and runs to done", async () => {
    const seen: IntendedAction[] = [];
    const core = new RunnerCore(dir, strategy, undefined, (runId, action) => {
      seen.push(action);
      void core.allowIntent(runId);
    });
    await core.init();
    const cwd = path.join(dir, "intent_allow");
    const run = await core.start({
      kind: "agent",
      ownerId: "ia",
      command: NODE,
      args: intentScript(cwd),
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "done");
    expect(seen[0]?.action).toBe("payment");
    expect(seen[0]?.metrics?.["purchase.amount"]).toBe(1200);
    expect(core.get(run.runId).status).toBe("done");
  });

  it("allows a file-triggered INTENT (the real-claude hook path) and runs to done", async () => {
    // The hook writes intent-request.json into cwd; the core's file watcher must
    // pick it up and route it through the same IntentHandler as the stdout path.
    const seen: IntendedAction[] = [];
    const core = new RunnerCore(dir, strategy, undefined, (runId, action) => {
      seen.push(action);
      void core.allowIntent(runId);
    });
    await core.init();
    const cwd = path.join(dir, "file_intent_allow");
    const run = await core.start({
      kind: "agent",
      ownerId: "fia",
      command: NODE,
      args: fileIntentScript(cwd),
      cwd,
      extra: { label: "x" },
    });
    // The file-watcher (fs.watch) cold-start plus a real child spawn can exceed the
    // default 5s on a loaded CI runner; give the watch-driven path generous headroom.
    await waitForStatus(core, run.runId, "done", 15000);
    expect(seen[0]?.action).toBe("payment");
    expect(seen[0]?.metrics?.["purchase.amount"]).toBe(1200);
    expect(core.get(run.runId).status).toBe("done");
  }, 15000);

  it("holds a file-triggered INTENT for approval, then resume releases it to done", async () => {
    const core = new RunnerCore(dir, strategy, undefined, (runId) => {
      void core.holdForApproval(runId);
    });
    await core.init();
    const cwd = path.join(dir, "file_intent_hold");
    const run = await core.start({
      kind: "agent",
      ownerId: "fih",
      command: NODE,
      args: fileIntentScript(cwd),
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "awaiting-approval", 15000);
    await core.resume(run.runId);
    await waitForStatus(core, run.runId, "done", 15000);
    expect(core.get(run.runId).status).toBe("done");
  }, 15000);

  it("denies a mid-run INTENT → the child aborts → interrupted (no error)", async () => {
    const core = new RunnerCore(dir, strategy, undefined, (runId) => {
      void core.denyIntent(runId);
    });
    await core.init();
    const cwd = path.join(dir, "intent_deny");
    const run = await core.start({
      kind: "agent",
      ownerId: "id",
      command: NODE,
      args: intentScript(cwd),
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "interrupted");
    expect(core.get(run.runId).status).toBe("interrupted");
  });

  it("holds a mid-run INTENT for approval, then resume releases it to done", async () => {
    const core = new RunnerCore(dir, strategy, undefined, (runId) => {
      void core.holdForApproval(runId);
    });
    await core.init();
    const cwd = path.join(dir, "intent_hold");
    const run = await core.start({
      kind: "agent",
      ownerId: "ih",
      command: NODE,
      args: intentScript(cwd),
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "awaiting-approval");
    await core.resume(run.runId);
    await waitForStatus(core, run.runId, "done");
    expect(core.get(run.runId).status).toBe("done");
  });

  it("a child that exits while still awaiting-approval lands on interrupted, never done", async () => {
    // Simulates the gate's blocking hook dying: the child announces an INTENT, is
    // held, then gives up and exits 0 with no decision ever written. Reporting that
    // as `done` would read as "completed as if approved".
    const core = new RunnerCore(dir, strategy, undefined, (runId) => {
      void core.holdForApproval(runId);
    });
    await core.init();
    const cwd = path.join(dir, "intent_walkout");
    const run = await core.start({
      kind: "agent",
      ownerId: "iw",
      command: NODE,
      args: [
        "-e",
        `console.log("PROGRESS 10");process.stdout.write('INTENT {"action":"payment","metrics":{}}\\n');setTimeout(()=>{console.log("PROGRESS 100");process.exit(0)},300)`,
      ],
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "awaiting-approval");
    await waitForStatus(core, run.runId, "interrupted");
    expect(core.get(run.runId).status).toBe("interrupted");
  });

  it("delete kills the live child of an awaiting-approval run", async () => {
    const core = new RunnerCore(dir, strategy, undefined, (runId) => {
      void core.holdForApproval(runId);
    });
    await core.init();
    const cwd = path.join(dir, "intent_delete");
    const run = await core.start({
      kind: "agent",
      ownerId: "idel",
      command: NODE,
      args: intentScript(cwd),
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "awaiting-approval");
    const pid = core.get(run.runId).pid;
    await core.delete(run.runId);
    expect(() => core.get(run.runId)).toThrow();
    // The blocked child must not survive the delete as an orphan.
    const start = Date.now();
    for (;;) {
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
      }
      if (!alive) break;
      if (Date.now() - start > 5000) throw new Error(`child ${pid} survived delete`);
      await sleep(20);
    }
  });

  it("rejecting a held mid-run INTENT interrupts the live child", async () => {
    const core = new RunnerCore(dir, strategy, undefined, (runId) => {
      void core.holdForApproval(runId);
    });
    await core.init();
    const cwd = path.join(dir, "intent_reject");
    const run = await core.start({
      kind: "agent",
      ownerId: "ir",
      command: NODE,
      args: intentScript(cwd),
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "awaiting-approval");
    core.cancel(run.runId);
    await waitForStatus(core, run.runId, "interrupted");
    expect(core.get(run.runId).status).toBe("interrupted");
  });

  // ─── Phase 9: usage-limit pause / resume ──────────────────────────────────

  /** A child that prints the real usage-limit line (with a reset epoch) then exits 1. */
  function limitScript(epochSeconds: number): string[] {
    return ["-e", `console.log("Claude AI usage limit reached|${epochSeconds}"); process.exit(1)`];
  }

  /** Marker-based: limit-then-exit-1 on the FIRST run, PROGRESS 100 + exit 0 after. */
  function limitOnceScript(cwd: string, epochSeconds: number): string[] {
    const marker = JSON.stringify(path.join(cwd, ".limit-marker"));
    const body = `const fs=require("node:fs");if(!fs.existsSync(${marker})){fs.writeFileSync(${marker},"1");console.log("Claude AI usage limit reached|${epochSeconds}");process.exit(1)}console.log("PROGRESS 100");process.exit(0)`;
    return ["-e", body];
  }

  /** A child that prints a limit line, then hangs — so a test can cancel it mid-run. */
  function limitThenHangScript(epochSeconds: number): string[] {
    return [
      "-e",
      `console.log("Claude AI usage limit reached|${epochSeconds}");setInterval(()=>{},1000)`,
    ];
  }

  /** Poll until the run's `resumeAt` is populated (set async after the status flips). */
  async function waitForResumeAt(
    core: RunnerCore<TestRecord>,
    runId: string,
    timeoutMs = 5000,
  ): Promise<number> {
    const start = Date.now();
    for (;;) {
      const at = core.get(runId).resumeAt;
      if (at != null) return at;
      if (Date.now() - start > timeoutMs) throw new Error(`resumeAt never set for ${runId}`);
      await sleep(20);
    }
  }

  it("classifies a child that dies on a usage limit as paused-limit with resumeAt + a pending spec", async () => {
    const epoch = Math.floor(Date.now() / 1000) + 3600;
    // resolveResumeAt echoes the detected reset (else a fallback) — the priority chain.
    const core = new RunnerCore(
      dir,
      strategy,
      undefined,
      undefined,
      undefined,
      undefined,
      async (detected) => detected ?? 1,
    );
    await core.init();
    const cwd = path.join(dir, "limit_classify");
    const run = await core.start({
      kind: "agent",
      ownerId: "lim",
      command: NODE,
      args: limitScript(epoch),
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "paused-limit");
    const resumeAt = await waitForResumeAt(core, run.runId);
    expect(resumeAt).toBe(epoch * 1000);
    expect(core.get(run.runId).limitResumeCycles).toBe(0);
    // The spawn spec is stashed so restart + respawn come free.
    const pending = JSON.parse(
      await fs.readFile(path.join(dir, `${run.runId}.pending.json`), "utf8"),
    );
    expect(pending.ownerId).toBe("lim");
    // A paused-limit run still streams its log, and is NOT marked done.
    expect((await core.readLog(run.runId, 0)).done).toBe(false);
  });

  it("falls back through resolveResumeAt when the limit line carries no reset epoch", async () => {
    const fallback = Date.now() + 1_800_000;
    const core = new RunnerCore(
      dir,
      strategy,
      undefined,
      undefined,
      undefined,
      undefined,
      async (detected) => detected ?? fallback,
    );
    await core.init();
    const cwd = path.join(dir, "limit_nofallback");
    // No `|epoch` → detectLimit returns resetsAt null → resolveResumeAt fallback.
    const run = await core.start({
      kind: "agent",
      ownerId: "lim2",
      command: NODE,
      args: ["-e", `console.log("Claude AI usage limit reached"); process.exit(1)`],
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "paused-limit");
    expect(await waitForResumeAt(core, run.runId)).toBe(fallback);
  });

  it("an operator cancel during a limit-struck run lands interrupted, never paused-limit", async () => {
    const epoch = Math.floor(Date.now() / 1000) + 3600;
    const core = new RunnerCore(
      dir,
      strategy,
      undefined,
      undefined,
      undefined,
      undefined,
      async (d) => d ?? 1,
    );
    await core.init();
    const cwd = path.join(dir, "limit_cancel");
    const run = await core.start({
      kind: "agent",
      ownerId: "limc",
      command: NODE,
      args: limitThenHangScript(epoch),
      cwd,
      extra: { label: "x" },
    });
    // Let the limit line be read, then cancel while still running.
    await sleep(150);
    core.cancel(run.runId);
    await waitForStatus(core, run.runId, "interrupted");
    expect(core.get(run.runId).status).toBe("interrupted");
  });

  it("resume() respawns a paused-limit run from its stashed spec and it can finish", async () => {
    const epoch = Math.floor(Date.now() / 1000) + 2;
    const core = new RunnerCore(
      dir,
      strategy,
      undefined,
      undefined,
      undefined,
      undefined,
      async (d) => d ?? 1,
    );
    await core.init();
    const cwd = path.join(dir, "limit_resume");
    const run = await core.start({
      kind: "agent",
      ownerId: "limr",
      command: NODE,
      args: limitOnceScript(cwd, epoch),
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "paused-limit");
    // The marker now exists, so the respawn succeeds → done.
    await core.resume(run.runId);
    await waitForStatus(core, run.runId, "done");
    expect(core.get(run.runId).status).toBe("done");
    // The pending spec is cleared once resumed.
    await expect(
      fs.readFile(path.join(dir, `${run.runId}.pending.json`), "utf8"),
    ).rejects.toThrow();
  });

  it("a paused-limit run with a pending spec survives a restart (init)", async () => {
    const epoch = Math.floor(Date.now() / 1000) + 3600;
    const core = new RunnerCore(
      dir,
      strategy,
      undefined,
      undefined,
      undefined,
      undefined,
      async (d) => d ?? 1,
    );
    await core.init();
    const cwd = path.join(dir, "limit_restart");
    const run = await core.start({
      kind: "agent",
      ownerId: "limx",
      command: NODE,
      args: limitScript(epoch),
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "paused-limit");
    await waitForResumeAt(core, run.runId);

    // A fresh core over the same dir rebuilds the registry from disk.
    const core2 = new RunnerCore(
      dir,
      strategy,
      undefined,
      undefined,
      undefined,
      undefined,
      async (d) => d ?? 1,
    );
    await core2.init();
    const restored = core2.get(run.runId);
    expect(restored.status).toBe("paused-limit");
    expect(restored.resumeAt).toBe(epoch * 1000);
  });

  it("a paused-limit sidecar WITHOUT a pending spec is reconciled to interrupted on restart", async () => {
    // Hand-write a paused-limit sidecar with no `.pending.json` (a real orphan).
    const runId = "orphan_1_1";
    const cwd = path.join(dir, "orphan_sandbox");
    await fs.mkdir(cwd, { recursive: true });
    const sidecar = {
      runId,
      kind: "agent",
      status: "paused-limit",
      pct: 0,
      cwd,
      startedAt: new Date().toISOString(),
      pid: 0,
      logFile: path.join(dir, `${runId}.log`),
      resumeAt: Date.now() + 1000,
      label: "x",
    };
    await fs.writeFile(path.join(dir, `${runId}.json`), JSON.stringify(sidecar), "utf8");
    const core = new RunnerCore(dir, strategy);
    await core.init();
    expect(core.get(runId).status).toBe("interrupted");
  });

  // ── Cost capture (Phase 03) ────────────────────────────────────────────────

  /** A `result` stream-json line carrying a total cost, one line, newline-terminated. */
  function resultCostLine(cost: number): string {
    return JSON.stringify({ type: "result", subtype: "success", total_cost_usd: cost });
  }

  /**
   * limit-then-exit-1 on the FIRST run (after emitting a `result` line with cost
   * `first`), then a `result` line with cost `second` + PROGRESS 100 + exit 0 on the
   * respawn — so a test can assert the two costs SUM (respawn is a fresh session, not
   * a `--resume` continuation).
   */
  function costLimitOnceScript(cwd: string, epochSeconds: number, first: number, second: number) {
    const marker = JSON.stringify(path.join(cwd, ".cost-marker"));
    const body = `const fs=require("node:fs");if(!fs.existsSync(${marker})){fs.writeFileSync(${marker},"1");console.log(${JSON.stringify(
      resultCostLine(first),
    )});console.log("Claude AI usage limit reached|${epochSeconds}");process.exit(1)}console.log(${JSON.stringify(
      resultCostLine(second),
    )});console.log("PROGRESS 100");process.exit(0)`;
    return ["-e", body];
  }

  it("accumulates result-event cost across a limit-pause respawn (sum, not overwrite)", async () => {
    const epoch = Math.floor(Date.now() / 1000) + 2;
    const core = new RunnerCore(
      dir,
      strategy,
      undefined,
      undefined,
      undefined,
      formatClaudeStreamLine,
      async (d) => d ?? 1,
    );
    await core.init();
    const cwd = path.join(dir, "cost_respawn");
    const run = await core.start({
      kind: "agent",
      ownerId: "costr",
      command: NODE,
      args: costLimitOnceScript(cwd, epoch, 0.1, 0.2),
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "paused-limit");
    await core.resume(run.runId);
    await waitForStatus(core, run.runId, "done");
    expect(core.get(run.runId).costUsd).toBeCloseTo(0.3, 10);
  });

  it("captures a result event delivered as the last line WITHOUT a trailing newline", async () => {
    const core = new RunnerCore(dir, strategy, undefined, undefined, undefined, formatClaudeStreamLine);
    await core.init();
    const cwd = path.join(dir, "cost_noeol");
    // Write the result line with NO trailing newline, then exit 0 → it lands in
    // `residual` and only `flushResidual` can rescue its cost.
    const body = `process.stdout.write(${JSON.stringify(resultCostLine(0.42))});process.exit(0)`;
    const run = await core.start({
      kind: "agent",
      ownerId: "costn",
      command: NODE,
      args: ["-e", body],
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "done");
    expect(core.get(run.runId).costUsd).toBeCloseTo(0.42, 10);
  });

  it("leaves costUsd undefined on a run without a formatLine (demo/test path)", async () => {
    const core = new RunnerCore(dir, strategy);
    await core.init();
    const cwd = path.join(dir, "cost_none");
    const body = `console.log(${JSON.stringify(resultCostLine(0.9))});console.log("PROGRESS 100");process.exit(0)`;
    const run = await core.start({
      kind: "agent",
      ownerId: "costx",
      command: NODE,
      args: ["-e", body],
      cwd,
      extra: { label: "x" },
    });
    await waitForStatus(core, run.runId, "done");
    expect(core.get(run.runId).costUsd).toBeUndefined();
  });
});
