import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_VERIFY_CHECKS,
  type IntendedAction,
  type PipelinePhase,
  type PipelineRun,
  type Project,
} from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumableRunner } from "../approvals/approvals.service";
import { RunNotFoundError } from "../runner/runner-core";
import { PipelineRunnerService } from "./pipeline-runner.service";

/** Minimal logger double matching the LoggerService surface the service uses. */
const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

const fakeTrace = {
  getTraceId: () => undefined,
  run: (_ctx: unknown, fn: () => unknown) => fn(),
};

interface FakeCore {
  init: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  holdForApproval: ReturnType<typeof vi.fn>;
  allowIntent: ReturnType<typeof vi.fn>;
  denyIntent: ReturnType<typeof vi.fn>;
  readLog: ReturnType<typeof vi.fn>;
  onLogAny: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
}

interface Harness {
  service: PipelineRunnerService;
  core: FakeCore;
  approvals: { register: ReturnType<typeof vi.fn>; requestApproval: ReturnType<typeof vi.fn> };
  gates: { rulesForAgent: ReturnType<typeof vi.fn>; evaluate: ReturnType<typeof vi.fn> };
  runs: Map<string, PipelineRun>;
  registered: Map<string, ResumableRunner>;
  /** Fire the fake core's "bytes appended" signal for one child run id. */
  emitLog: (runId: string) => void;
  dir: string;
}

const STAGE_RUN_ID = "release_100.build_200_42";
const PIPELINE_RUN_ID = "release_100";

async function makeHarness(dir: string): Promise<Harness> {
  const registered = new Map<string, ResumableRunner>();
  const approvals = {
    register: vi.fn((kind: string, runner: ResumableRunner) => registered.set(kind, runner)),
    requestApproval: vi.fn(async () => ({})),
  };
  const gates = {
    rulesForAgent: vi.fn(async () => []),
    evaluate: vi.fn(() => ({ decision: "ask", ruleId: "rule-1" })),
  };
  const pipelines = {
    get: vi.fn(async () => ({
      id: "release",
      phases: [
        {
          id: "build",
          agent: "writer",
          consumes: "in.md",
          produces: "out.md",
          model: "sonnet",
          thinking: "medium",
        },
      ],
      instructions: "ship",
    })),
  };
  const agents = {
    get: vi.fn(async () => ({
      id: "writer",
      name: "Writer",
      instructions: "writes",
      risk: "high",
    })),
  };

  const service = new PipelineRunnerService(
    dir,
    pipelines as never,
    agents as never,
    { buildClaudeCommand: vi.fn() } as never,
    { materialize: vi.fn(async () => {}) } as never,
    { assertAvailable: vi.fn(), probe: vi.fn() } as never,
    approvals as never,
    gates as never,
    { get: vi.fn(async () => null), list: vi.fn(async () => []) } as never,
    // Workspace double: non-git by default, so the test path keeps the Phase 2
    // direct-checkout behavior (no worktree). Phase 3.1 worktree wiring is covered
    // by workspace.service.test.ts + the git-fixture e2e.
    {
      isGitRepo: vi.fn(async () => false),
      createWorktree: vi.fn(),
      removeWorktree: vi.fn(async () => {}),
      diffstat: vi.fn(async () => ""),
    } as never,
    { compose: vi.fn(async () => "") } as never,
    // Vault double: this pipeline declares no `outputs`, so the delivery sinks never
    // touch it; present only to keep the positional constructor aligned.
    { createNote: vi.fn(async () => ({})), updateNote: vi.fn(async () => ({})) } as never,
    // Limits double (Phase 9): headroom by default so the boundary/mid-stage limit
    // guards stay out of the way of the gate/resume tests; windowExhausted → false.
    {
      noteLimitHit: vi.fn(),
      resolveResumeAt: vi.fn(async () => Date.now() + 1_000),
      windowExhausted: vi.fn(async () => ({ exhausted: false, resumeAt: null })),
    } as never,
    fakeLogger as never,
    fakeTrace as never,
    { read: vi.fn(async () => null), has: vi.fn(async () => false) } as never,
    // Activity log double (Phase 45): record() is fire-and-forget and never throws.
    { record: vi.fn(async () => {}) } as never,
    // Artifact registry double (N2a): delivery sinks write provenance records.
    { record: vi.fn(async () => {}) } as never,
  );

  // Swap the real core (which spawns processes) for a scriptable double.
  const logListeners = new Set<(runId: string) => void>();
  const core: FakeCore = {
    init: vi.fn(async () => {}),
    start: vi.fn(async () => ({ runId: STAGE_RUN_ID })),
    get: vi.fn(() => ({
      runId: STAGE_RUN_ID,
      pipelineRunId: PIPELINE_RUN_ID,
      phaseId: "build",
      status: "running",
    })),
    resume: vi.fn(async () => ({})),
    cancel: vi.fn(),
    holdForApproval: vi.fn(async () => {}),
    allowIntent: vi.fn(async () => {}),
    denyIntent: vi.fn(async () => {}),
    readLog: vi.fn(async () => ({ content: "tail of the failure", nextOffset: 0, done: true })),
    onLogAny: vi.fn((l: (runId: string) => void) => {
      logListeners.add(l);
      return () => logListeners.delete(l);
    }),
    shutdown: vi.fn(),
  };
  (service as unknown as { core: FakeCore }).core = core;

  // Seed the in-memory aggregate the intent path mutates.
  const run: PipelineRun = {
    pipelineRunId: PIPELINE_RUN_ID,
    pipelineId: "release",
    status: "running",
    currentStage: "build",
    stageRuns: [],
    startedAt: new Date().toISOString(),
    cwd: path.join(dir, PIPELINE_RUN_ID),
  };
  await fs.mkdir(run.cwd, { recursive: true });
  const runs = (service as unknown as { runs: Map<string, PipelineRun> }).runs;
  runs.set(PIPELINE_RUN_ID, run);

  return {
    service,
    core,
    approvals,
    gates,
    runs,
    registered,
    emitLog: (runId: string) => {
      for (const l of logListeners) l(runId);
    },
    dir,
  };
}

const intent: IntendedAction = { action: "delete" };

async function fireIntent(h: Harness): Promise<void> {
  await (
    h.service as unknown as {
      onStageIntent(id: string, action: IntendedAction): Promise<void>;
    }
  ).onStageIntent(STAGE_RUN_ID, intent);
}

describe("PipelineRunnerService — stage gates & resume", () => {
  let dir: string;
  let h: Harness;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "pipe-runner-unit-"));
    h = await makeHarness(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("ask: holds the stage, parks the aggregate, and raises a pipeline-stage approval", async () => {
    h.gates.evaluate.mockReturnValue({ decision: "ask", ruleId: "rule-1" });
    await fireIntent(h);

    expect(h.core.holdForApproval).toHaveBeenCalledWith(STAGE_RUN_ID);
    expect(h.runs.get(PIPELINE_RUN_ID)?.status).toBe("parked");
    expect(h.approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "pipeline-stage", runId: STAGE_RUN_ID, risk: "high" }),
    );
    // The parked transition was persisted for restart fidelity.
    const sidecar = JSON.parse(
      await fs.readFile(path.join(dir, PIPELINE_RUN_ID, "run.json"), "utf8"),
    ) as PipelineRun;
    expect(sidecar.status).toBe("parked");
  });

  it("deny: refuses the intent without parking", async () => {
    h.gates.evaluate.mockReturnValue({ decision: "deny", ruleId: "rule-d" });
    await fireIntent(h);
    expect(h.core.denyIntent).toHaveBeenCalledWith(STAGE_RUN_ID);
    expect(h.runs.get(PIPELINE_RUN_ID)?.status).toBe("running");
    expect(h.approvals.requestApproval).not.toHaveBeenCalled();
  });

  it("allow: releases the intent immediately", async () => {
    h.gates.evaluate.mockReturnValue({ decision: "allow" });
    await fireIntent(h);
    expect(h.core.allowIntent).toHaveBeenCalledWith(STAGE_RUN_ID);
  });

  it("fails safe to deny when the evaluation blows up", async () => {
    h.gates.evaluate.mockImplementation(() => {
      throw new Error("boom");
    });
    await fireIntent(h);
    expect(h.core.denyIntent).toHaveBeenCalledWith(STAGE_RUN_ID);
  });

  it("registers for pipeline-stage approvals; resume un-parks the aggregate", async () => {
    await h.service.onModuleInit();
    const runner = h.registered.get("pipeline-stage");
    expect(runner).toBeDefined();

    const run = h.runs.get(PIPELINE_RUN_ID);
    if (run) run.status = "parked";
    await runner?.resume(STAGE_RUN_ID);
    expect(h.core.resume).toHaveBeenCalledWith(STAGE_RUN_ID);
    expect(h.runs.get(PIPELINE_RUN_ID)?.status).toBe("running");
  });

  it("resume/cancel tolerate an unknown run (log + no-op)", async () => {
    await h.service.onModuleInit();
    const runner = h.registered.get("pipeline-stage");
    h.core.resume.mockRejectedValue(new RunNotFoundError("gone"));
    await expect(runner?.resume("gone")).resolves.toBeUndefined();
    h.core.cancel.mockImplementation(() => {
      throw new RunNotFoundError("gone");
    });
    expect(() => runner?.cancel("gone")).not.toThrow();
  });

  it("waitForStage rides through awaiting-approval and returns only on terminal", async () => {
    const statuses = ["running", "awaiting-approval", "awaiting-approval", "done"];
    let i = 0;
    h.core.get.mockImplementation(() => ({
      runId: STAGE_RUN_ID,
      status: statuses[Math.min(i++, statuses.length - 1)],
    }));
    const status = await (
      h.service as unknown as { waitForStage(id: string): Promise<string> }
    ).waitForStage(STAGE_RUN_ID);
    expect(status).toBe("done");
    expect(i).toBeGreaterThanOrEqual(4);
  });

  describe("readStageLog (live in-flight stage)", () => {
    it("tails the running phase by its live currentStageRunId (not yet in stageRuns)", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID)!;
      // The build phase is executing — recorded only as `currentStage` +
      // `currentStageRunId`, with nothing in `stageRuns` yet.
      run.currentStage = "build";
      run.currentStageRunId = "release_100.build_live";
      run.stageRuns = [];
      await h.service.readStageLog(PIPELINE_RUN_ID, "build", 0);
      expect(h.core.readLog).toHaveBeenCalledWith("release_100.build_live", 0);
    });

    it("prefers the live attempt over an earlier terminal attempt of the same phase", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID)!;
      run.currentStage = "build";
      run.currentStageRunId = "release_100.build_2";
      run.stageRuns = [
        { phaseId: "build", runId: "release_100.build_1", attempt: 1, status: "error" },
      ];
      await h.service.readStageLog(PIPELINE_RUN_ID, "build", 0);
      expect(h.core.readLog).toHaveBeenCalledWith("release_100.build_2", 0);
    });

    it("reads a terminal phase from its recorded stageRuns entry", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID)!;
      run.currentStage = "verify";
      run.currentStageRunId = "release_100.verify_1";
      run.stageRuns = [
        { phaseId: "build", runId: "release_100.build_1", attempt: 1, status: "done" },
      ];
      await h.service.readStageLog(PIPELINE_RUN_ID, "build", 5);
      expect(h.core.readLog).toHaveBeenCalledWith("release_100.build_1", 5);
    });

    it("falls back to the on-disk aggregate for a run evicted from memory", async () => {
      // A finished run aged past RETENTION_MS is dropped from the in-memory registry,
      // but its aggregate + stage logs persist on disk — the detail view must still
      // tail them instead of 404ing (PipelineRunNotFoundError).
      const goneId = "evicted_1780000000099";
      const root = path.join(dir, goneId);
      await fs.mkdir(root, { recursive: true });
      await fs.writeFile(
        path.join(root, "run.json"),
        JSON.stringify({
          pipelineRunId: goneId,
          pipelineId: "release",
          status: "done",
          currentStage: null,
          stageRuns: [
            { phaseId: "build", runId: `${goneId}.build_1`, attempt: 1, status: "done" },
          ],
          startedAt: new Date().toISOString(),
          cwd: root,
        }),
        "utf8",
      );
      // Not in memory — the registry only has PIPELINE_RUN_ID.
      expect(h.runs.has(goneId)).toBe(false);
      await h.service.readStageLog(goneId, "build", 0);
      expect(h.core.readLog).toHaveBeenCalledWith(`${goneId}.build_1`, 0);
    });
  });

  describe("onStageLogAppend (the SSE stage tail's wake signal)", () => {
    it("fires for the phase's resolved attempt, follows a retry swap, ignores everything else", () => {
      const run = h.runs.get(PIPELINE_RUN_ID)!;
      run.currentStage = "build";
      run.currentStageRunId = "release_100.build_1";
      run.stageRuns = [];
      const listener = vi.fn();
      const unsub = h.service.onStageLogAppend(PIPELINE_RUN_ID, "build", listener);

      // The live attempt appends → signal.
      h.emitLog("release_100.build_1");
      expect(listener).toHaveBeenCalledTimes(1);

      // An unrelated run's append is filtered out.
      h.emitLog("other_run.x_1");
      expect(listener).toHaveBeenCalledTimes(1);

      // A retry swaps the attempt mid-stream — the same subscription keeps
      // signalling (the reader re-resolves the attempt per chunk).
      run.stageRuns = [
        { phaseId: "build", runId: "release_100.build_1", attempt: 1, status: "error" },
      ];
      run.currentStageRunId = "release_100.build_2";
      h.emitLog("release_100.build_2");
      expect(listener).toHaveBeenCalledTimes(2);

      // A recorded (terminal) attempt of the phase still counts.
      h.emitLog("release_100.build_1");
      expect(listener).toHaveBeenCalledTimes(3);

      unsub();
      h.emitLog("release_100.build_2");
      expect(listener).toHaveBeenCalledTimes(3);
    });

    it("an unknown pipeline run never fires (no aggregate fallback needed for appends)", () => {
      const listener = vi.fn();
      h.service.onStageLogAppend("nope_1", "build", listener);
      h.emitLog("release_100.build_1");
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("buildStageCommand", () => {
    const PROJECT: Project = {
      id: "demo-proj",
      name: "Demo project",
      path: "/srv/checkouts/demo",
      checks: ["pnpm check:one", "pnpm check:two"],
    };

    const build = (phase: PipelinePhase, project: Project | null) =>
      (
        h.service as unknown as {
          buildStageCommand(
            phase: PipelinePhase,
            cwd: string,
            project: Project | null,
          ): Promise<{ command: string; args: string[]; spawnCwd?: string }>;
        }
      ).buildStageCommand(phase, "/sandbox/stage", project);

    const verifyPhase = (over: Partial<PipelinePhase> = {}): PipelinePhase => ({
      id: "verify",
      type: "verify",
      ...over,
    });

    const agentPhase = (over: Partial<PipelinePhase> = {}): PipelinePhase => ({
      id: "build",
      type: "agent",
      agent: "writer",
      consumes: "in.md",
      produces: "out.md",
      model: "sonnet",
      thinking: "medium",
      ...over,
    });

    afterEach(() => {
      delete process.env.AGENT_RUNNER_MODE;
    });

    it("verify: a phase-level commands override wins", async () => {
      const cmd = await build(verifyPhase({ commands: ["make test"] }), PROJECT);
      expect(cmd).toEqual({
        command: "/bin/sh",
        args: ["-c", "make test"],
        spawnCwd: "/srv/checkouts/demo",
      });
    });

    it("verify: falls back to the project's checks, joined with &&", async () => {
      const cmd = await build(verifyPhase(), PROJECT);
      expect(cmd.args).toEqual(["-c", "pnpm check:one && pnpm check:two"]);
      expect(cmd.spawnCwd).toBe("/srv/checkouts/demo");
    });

    it("verify: falls back to the shared defaults in the sandbox without a project", async () => {
      const cmd = await build(verifyPhase(), null);
      expect(cmd.args).toEqual(["-c", DEFAULT_VERIFY_CHECKS.join(" && ")]);
      expect(cmd.spawnCwd).toBeUndefined();
    });

    it("verify runs identically in claude mode (no model, no preflight)", async () => {
      process.env.AGENT_RUNNER_MODE = "claude";
      const cmd = await build(verifyPhase(), PROJECT);
      expect(cmd.command).toBe("/bin/sh");
    });

    it("claude: a project-targeted stage with a consumes handoff grants the whole run root (P1-T2)", async () => {
      process.env.AGENT_RUNNER_MODE = "claude";
      const buildClaude = vi.fn(async (opts: { task: string; grantDirs?: readonly string[] }) => ({
        command: "claude",
        args: ["-p", opts.task],
      }));
      (h.service as unknown as { claude: unknown }).claude = { buildClaudeCommand: buildClaude };
      (h.service as unknown as { agents: unknown }).agents = {
        get: vi.fn(async () => ({ id: "writer", instructions: "write", model: "opus" })),
      };

      const cmd = await build(agentPhase(), PROJECT);
      expect(cmd.spawnCwd).toBe("/srv/checkouts/demo");
      const opts = buildClaude.mock.calls[0]?.[0] as {
        task: string;
        grantDirs?: readonly string[];
        model?: string;
        streamTranscript?: boolean;
      };
      // The `consumes` handoff is now a symlink that may target a PREVIOUS phase's
      // sibling sandbox folder (a sibling of "/sandbox/stage" under the run root
      // "/sandbox") — granting only the current stage's own folder would leave that
      // read outside the sandbox/`--add-dir` grant, so the whole run root is granted.
      expect(opts.grantDirs).toEqual(["/sandbox"]);
      // Handoff paths are absolute — sandbox-relative would resolve in the repo.
      expect(opts.task).toContain(path.join("/sandbox/stage", "in.md"));
      expect(opts.task).toContain(path.join("/sandbox/stage", "out.md"));
      // The phase-level model wins over the agent's default.
      expect(opts.model).toBe("sonnet");
      // Stream-json so the stage log captures the agent's whole run, not just the
      // final message (the per-phase "complete log" fix).
      expect(opts.streamTranscript).toBe(true);
    });

    it("claude: without a project a consumes handoff still grants the run root (P1-T2)", async () => {
      process.env.AGENT_RUNNER_MODE = "claude";
      const buildClaude = vi.fn(async (opts: { task: string; grantDirs?: readonly string[] }) => ({
        command: "claude",
        args: ["-p", opts.task],
      }));
      (h.service as unknown as { claude: unknown }).claude = { buildClaudeCommand: buildClaude };
      (h.service as unknown as { agents: unknown }).agents = {
        get: vi.fn(async () => ({ id: "writer", instructions: "write" })),
      };

      const cmd = await build(agentPhase(), null);
      expect(cmd.spawnCwd).toBeUndefined();
      const opts = buildClaude.mock.calls[0]?.[0] as { grantDirs?: readonly string[] };
      // Even without a project the process's own cwd IS the stage sandbox, but a
      // symlinked `consumes` can still point at a sibling stage folder — so the run
      // root ("/sandbox", the parent of "/sandbox/stage") is still granted.
      expect(opts.grantDirs).toEqual(["/sandbox"]);
    });

    it("claude: a first phase with no consumes keeps the narrow own-sandbox grant (project) / no grant (sandbox-only)", async () => {
      process.env.AGENT_RUNNER_MODE = "claude";
      const buildClaude = vi.fn(async (opts: { task: string; grantDirs?: readonly string[] }) => ({
        command: "claude",
        args: ["-p", opts.task],
      }));
      (h.service as unknown as { claude: unknown }).claude = { buildClaudeCommand: buildClaude };
      (h.service as unknown as { agents: unknown }).agents = {
        get: vi.fn(async () => ({ id: "writer", instructions: "write" })),
      };

      const firstPhase = agentPhase({ consumes: undefined });

      const projectCmd = await build(firstPhase, PROJECT);
      expect(projectCmd.spawnCwd).toBe("/srv/checkouts/demo");
      const projectOpts = buildClaude.mock.calls[0]?.[0] as { grantDirs?: readonly string[] };
      // Nothing to read cross-folder — just the reverse grant so the session can
      // still write `produces` back into its own sandbox.
      expect(projectOpts.grantDirs).toEqual(["/sandbox/stage"]);

      buildClaude.mockClear();
      const sandboxCmd = await build(firstPhase, null);
      expect(sandboxCmd.spawnCwd).toBeUndefined();
      const sandboxOpts = buildClaude.mock.calls[0]?.[0] as { grantDirs?: readonly string[] };
      // The process's own cwd already IS the sandbox — nothing extra to grant.
      expect(sandboxOpts.grantDirs).toBeUndefined();
    });
  });

  it("reconstruct reconciles an approval-parked aggregate to failed", async () => {
    const ghostId = "ghost_1780000000000";
    const root = path.join(dir, ghostId);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: ghostId,
        pipelineId: "release",
        status: "parked",
        parkedReason: "approval",
        currentStage: "build",
        stageRuns: [],
        startedAt: new Date().toISOString(),
        cwd: root,
      }),
      "utf8",
    );
    await (h.service as unknown as { reconstruct(): Promise<void> }).reconstruct();
    const run = h.service.get(ghostId);
    expect(run.status).toBe("failed");
    expect(run.currentStage).toBeNull();
    expect(run.parkedReason).toBeUndefined();
  });

  it("reconstruct keeps a retries-parked aggregate parked (durable, no child)", async () => {
    const ghostId = "ghost_1780000000001";
    const root = path.join(dir, ghostId);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: ghostId,
        pipelineId: "release",
        status: "parked",
        parkedReason: "retries",
        parked: {
          phaseId: "build",
          attempts: 3,
          failureFile: path.join(root, "build.failure.txt"),
        },
        retries: { build: 2 },
        currentStage: "build",
        stageRuns: [],
        startedAt: new Date().toISOString(),
        cwd: root,
      }),
      "utf8",
    );
    await (h.service as unknown as { reconstruct(): Promise<void> }).reconstruct();
    const run = h.service.get(ghostId);
    expect(run.status).toBe("parked");
    expect(run.parkedReason).toBe("retries");
    expect(run.retries).toEqual({ build: 2 });
  });

  describe("escalation ladder", () => {
    const phaseWithLadder: PipelinePhase = {
      id: "review",
      type: "agent",
      agent: "writer",
      consumes: "in.md",
      produces: "out.md",
      model: "sonnet",
      thinking: "medium",
      loop: {
        to: "build",
        maxRetries: 5,
        escalate: true,
        then: "park",
        escalation: [{ model: "opus" }, { model: "opus", thinking: "high" }],
      },
    };

    const rungFor = (attempt: number) =>
      (
        h.service as unknown as {
          escalationFor(phase: PipelinePhase, attempt: number): unknown;
        }
      ).escalationFor(phaseWithLadder, attempt);

    it("applies no rung to the original attempt", () => {
      expect(rungFor(1)).toBeNull();
    });

    it("retry n applies rung n (1-based)", () => {
      expect(rungFor(2)).toEqual({ model: "opus" });
      expect(rungFor(3)).toEqual({ model: "opus", thinking: "high" });
    });

    it("later retries clamp to the last rung", () => {
      expect(rungFor(6)).toEqual({ model: "opus", thinking: "high" });
    });
  });

  describe("retries parking + resume", () => {
    const parkedPipeline = {
      id: "release",
      phases: [
        {
          id: "build",
          type: "agent",
          agent: "writer",
          consumes: "in.md",
          produces: "out.md",
          model: "sonnet",
          thinking: "medium",
        },
        {
          id: "review",
          type: "agent",
          agent: "writer",
          consumes: "out.md",
          produces: "review.md",
          model: "sonnet",
          thinking: "medium",
          loop: { to: "build", maxRetries: 0, escalate: true, then: "park" },
        },
      ],
      instructions: "ship",
    };

    it("exhaustion with then:'park' parks durably — no failed status, no synthetic marker", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      // Stage results: build done, review error → retries (0) exhausted → park.
      const statuses = ["done", "error"];
      let call = 0;
      (h.service as unknown as { runStage: unknown }).runStage = vi.fn(
        async (_run: unknown, phase: { id: string }, _cwd: string, attempt: number) => ({
          phaseId: phase.id,
          runId: `${PIPELINE_RUN_ID}.${phase.id}_${call}`,
          attempt,
          status: statuses[Math.min(call++, statuses.length - 1)],
        }),
      );

      await (
        h.service as unknown as {
          drive(run: PipelineRun, pipeline: unknown): Promise<void>;
        }
      ).drive(run, parkedPipeline);

      expect(run.status).toBe("parked");
      expect(run.parkedReason).toBe("retries");
      expect(run.parked).toMatchObject({ phaseId: "review", attempts: 1 });
      expect(run.retries).toEqual({});
      // No synthetic ".escalated" marker on the park path.
      expect(run.stageRuns.some((s) => s.runId.endsWith(".escalated"))).toBe(false);
      // The failure context exists (the resume handoff).
      const failure = await fs.readFile(run.parked?.failureFile ?? "", "utf8");
      expect(failure).toContain('Phase "review" failed');
    });

    it("resumeParked injects the note, resets the counter and re-enters at loop.to", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      const failureFile = path.join(run.cwd, "review.failure.txt");
      await fs.writeFile(failureFile, "Phase review failed.", "utf8");
      run.status = "parked";
      run.parkedReason = "retries";
      run.parked = { phaseId: "review", attempts: 3, failureFile };
      run.retries = { review: 2 };
      (
        h.service as unknown as { pipelines: { get: ReturnType<typeof vi.fn> } }
      ).pipelines.get.mockResolvedValue(parkedPipeline);

      const drive = vi.fn(async () => {});
      (h.service as unknown as { drive: unknown }).drive = drive;

      const resumed = await h.service.resumeParked(PIPELINE_RUN_ID, "zkus to přes mock");
      expect(resumed.status).toBe("running");
      expect(resumed.parkedReason).toBeUndefined();
      expect(resumed.parked).toBeUndefined();
      expect(resumed.retries).toEqual({ review: 0 });
      expect(resumed.currentStage).toBe("build");

      // The note landed in its own file AND in the failure-context handoff.
      const note = await fs.readFile(path.join(run.cwd, "review.note.md"), "utf8");
      expect(note).toContain("zkus to přes mock");
      const failure = await fs.readFile(failureFile, "utf8");
      expect(failure).toContain("Operator note");
      expect(failure).toContain("zkus to přes mock");

      // The driver re-entered the machine at loop.to with the failure handoff.
      await vi.waitFor(() => expect(drive).toHaveBeenCalled());
      const resume = (drive.mock.calls[0] as unknown as unknown[])?.[3] as {
        cursor: string;
        handoffSource: string;
        retries: Map<string, number>;
      };
      expect(resume.cursor).toBe("build");
      expect(resume.handoffSource).toBe(failureFile);
      expect(resume.retries.get("review")).toBe(0);
    });

    it("resumeParked refuses a run that is not retries-parked (409 material)", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      run.status = "parked";
      run.parkedReason = "approval";
      await expect(h.service.resumeParked(PIPELINE_RUN_ID)).rejects.toMatchObject({
        name: "RunNotRetriesParkedError",
      });
      run.status = "running";
      delete run.parkedReason;
      await expect(h.service.resumeParked(PIPELINE_RUN_ID)).rejects.toMatchObject({
        name: "RunNotRetriesParkedError",
      });
    });
  });

  describe("qualify gate (Phase 45)", () => {
    // A plain phase literal (untyped, like `parkedPipeline` above) so it can be cast
    // to `unknown` when passed to drive(); each phase produces `<id>.md`.
    const phase = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      type: "agent",
      agent: "writer",
      consumes: "in.md",
      produces: `${id}.md`,
      model: "sonnet",
      thinking: "medium",
      ...extra,
    });

    /**
     * Replace runStage with a scriptable double: each call records the executed phase
     * id, writes the phase's `produces` artifact with an optional `<verdict>` tag (so
     * drive()'s real grading runs against on-disk artifacts), and returns `done`.
     */
    function scriptRunStage(
      order: string[],
      verdictFor: (phaseId: string, attempt: number) => string | null,
    ): void {
      (h.service as unknown as { runStage: unknown }).runStage = vi.fn(
        async (_run: unknown, p: { id: string; produces?: string }, cwd: string, attempt: number) => {
          order.push(p.id);
          const verdict = verdictFor(p.id, attempt);
          const tag = verdict ? `\n<verdict>${verdict}</verdict>\n` : "";
          if (p.produces) await fs.writeFile(path.join(cwd, p.produces), `out${tag}`, "utf8");
          return {
            phaseId: p.id,
            runId: `${PIPELINE_RUN_ID}.${p.id}_${attempt}`,
            attempt,
            status: "done" as const,
          };
        },
      );
    }

    const drive = (run: PipelineRun, pipeline: unknown) =>
      (
        h.service as unknown as { drive(r: PipelineRun, p: unknown): Promise<void> }
      ).drive(run, pipeline);

    it("gap loops the work back, then pass advances to the end", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      const pipeline = {
        id: "release",
        phases: [
          phase("a"),
          phase("review", {
            qualify: true,
            loop: { to: "a", driftTo: "a", maxRetries: 1, escalate: false, then: "park" },
          }),
          phase("z"),
        ],
        instructions: "ship",
      };
      const order: string[] = [];
      scriptRunStage(order, (id, attempt) =>
        id === "review" ? (attempt === 1 ? "gap" : "pass") : null,
      );

      await drive(run, pipeline);

      expect(run.status).toBe("done");
      const reviews = run.stageRuns.filter((s) => s.phaseId === "review");
      expect(reviews).toHaveLength(2);
      expect(reviews[0]?.verdict).toBe("gap");
      expect(reviews[1]?.verdict).toBe("pass");
      expect(order).toEqual(["a", "review", "a", "review", "z"]);
    });

    it("a missing verdict on a qualify phase fails closed to gap (back-edge, not advance)", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      const pipeline = {
        id: "release",
        phases: [
          phase("a"),
          phase("review", {
            qualify: true,
            loop: { to: "a", maxRetries: 0, escalate: false, then: "park" },
          }),
          phase("z"),
        ],
        instructions: "ship",
      };
      const order: string[] = [];
      scriptRunStage(order, () => null); // a qualify phase that never emits a tag

      await drive(run, pipeline);

      expect(run.status).toBe("parked");
      expect(run.parkedReason).toBe("retries");
      const review = run.stageRuns.find((s) => s.phaseId === "review");
      expect(review?.verdict).toBe("gap");
      expect(order).not.toContain("z"); // never advanced past the gate
    });

    it("drift routes the back-edge to loop.driftTo, not loop.to", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      const pipeline = {
        id: "release",
        phases: [
          phase("architekt"),
          phase("koder"),
          phase("review", {
            qualify: true,
            loop: {
              to: "koder",
              driftTo: "architekt",
              maxRetries: 1,
              escalate: false,
              then: "park",
            },
          }),
        ],
        instructions: "ship",
      };
      const order: string[] = [];
      scriptRunStage(order, (id) => (id === "review" ? "drift" : null));

      await drive(run, pipeline);

      // First review's drift re-plans via driftTo (architekt), NOT loop.to (koder).
      expect(order).toEqual(["architekt", "koder", "review", "architekt", "koder", "review"]);
      const review = run.stageRuns.find((s) => s.phaseId === "review");
      expect(review?.verdict).toBe("drift");
      expect(run.status).toBe("parked"); // exhausted at maxRetries:1
    });

    it("a non-qualify pipeline behaves exactly as before (no grading)", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      const pipeline = {
        id: "release",
        phases: [phase("a"), phase("b")],
        instructions: "ship",
      };
      const order: string[] = [];
      scriptRunStage(order, () => null);

      await drive(run, pipeline);

      expect(run.status).toBe("done");
      expect(order).toEqual(["a", "b"]);
      expect(run.stageRuns.every((s) => s.verdict === undefined)).toBe(true);
    });
  });

  describe("sequential stage folder numbering (P1-T1)", () => {
    const loopPipeline = {
      id: "release",
      phases: [
        {
          id: "developer",
          type: "agent",
          agent: "writer",
          consumes: "in.md",
          produces: "out.md",
          model: "sonnet",
          thinking: "medium",
        },
        {
          id: "code-review",
          type: "agent",
          agent: "writer",
          consumes: "out.md",
          produces: "review.md",
          model: "sonnet",
          thinking: "medium",
          loop: { to: "developer", maxRetries: 1, escalate: false, then: "park" },
        },
      ],
      instructions: "ship",
    };

    /**
     * Script the fake core so the REAL runStage executes (demo command path, no
     * child process): start() records each dispatch's cwd and drops a marker file
     * into it, get() reports the scripted terminal outcome for waitForStage.
     */
    function scriptCore(outcomes: readonly string[]): { cwds: string[] } {
      const cwds: string[] = [];
      const statusByRunId = new Map<string, string>();
      h.core.start.mockImplementation(async (spec: { ownerId: string; cwd: string }) => {
        const runId = `${spec.ownerId}_${cwds.length}`;
        statusByRunId.set(runId, outcomes[cwds.length] ?? "done");
        await fs.writeFile(path.join(spec.cwd, "marker.txt"), runId, "utf8");
        cwds.push(spec.cwd);
        return { runId };
      });
      h.core.get.mockImplementation((runId: string) => ({
        runId,
        status: statusByRunId.get(runId) ?? "done",
      }));
      return { cwds };
    }

    const drive = (run: PipelineRun, pipeline: unknown) =>
      (h.service as unknown as { drive(r: PipelineRun, p: unknown): Promise<void> }).drive(
        run,
        pipeline,
      );

    const resolveOutputSource = (run: PipelineRun, pipeline: unknown, fromName: string) =>
      (
        h.service as unknown as {
          resolveOutputSource(r: PipelineRun, p: unknown, f: string): Promise<string | null>;
        }
      ).resolveOutputSource(run, pipeline, fromName);

    it("numbers stage folders in dispatch order — a loop's second run never overwrites the first", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      // developer done → code-review error → back-edge → developer done → code-review done
      const { cwds } = scriptCore(["done", "error", "done", "done"]);

      await drive(run, loopPipeline);

      expect(run.status).toBe("done");
      expect(run.stageRuns.map((s) => s.dir)).toEqual([
        "01_developer",
        "02_code-review",
        "03_developer",
        "04_code-review",
      ]);
      expect(cwds.map((c) => path.basename(c))).toEqual([
        "01_developer",
        "02_code-review",
        "03_developer",
        "04_code-review",
      ]);
      // Both developer sandboxes exist independently — nothing was overwritten.
      const first = await fs.readFile(path.join(run.cwd, "01_developer", "marker.txt"), "utf8");
      const second = await fs.readFile(path.join(run.cwd, "03_developer", "marker.txt"), "utf8");
      expect(first).not.toBe(second);
    });

    it("resolveOutputSource (no output/ dir): targets the LATEST numbered folder of the producing phase", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      run.stageRuns = [
        { phaseId: "developer", runId: "r1", attempt: 1, status: "done", dir: "01_developer" },
        { phaseId: "code-review", runId: "r2", attempt: 1, status: "error", dir: "02_code-review" },
        { phaseId: "developer", runId: "r3", attempt: 2, status: "done", dir: "03_developer" },
      ];
      await expect(resolveOutputSource(run, loopPipeline, "out.md")).resolves.toBe(
        path.join(run.cwd, "03_developer", "out.md"),
      );
    });

    it("backcompat: no output/ dir on disk (pre-P1-T3 run) — old flat phase-id folder lookup", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      run.stageRuns = [{ phaseId: "developer", runId: "r1", attempt: 1, status: "done" }];
      await expect(resolveOutputSource(run, loopPipeline, "out.md")).resolves.toBe(
        path.join(run.cwd, "developer", "out.md"),
      );
    });

    it("P1-T3 (Fáze 4): with an output/ dir present, resolveOutputSource links + reads output/<name>", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      run.stageRuns = [
        { phaseId: "developer", runId: "r1", attempt: 1, status: "done", dir: "01_developer" },
      ];
      await fs.mkdir(path.join(run.cwd, "01_developer"), { recursive: true });
      await fs.writeFile(path.join(run.cwd, "01_developer", "out.md"), "canonical", "utf8");
      await fs.mkdir(path.join(run.cwd, "output"), { recursive: true }); // start() creates this

      const resolved = await resolveOutputSource(run, loopPipeline, "out.md");

      expect(resolved).toBe(path.join(run.cwd, "output", "out.md"));
      const lst = await fs.lstat(resolved!);
      expect(lst.isSymbolicLink()).toBe(true);
      expect(path.isAbsolute(await fs.readlink(resolved!))).toBe(false);
      expect(await fs.readFile(resolved!, "utf8")).toBe("canonical");

      // A second read is idempotent — the existing link is left alone, not replaced.
      const resolvedAgain = await resolveOutputSource(run, loopPipeline, "out.md");
      expect(resolvedAgain).toBe(resolved);
      expect(await fs.readlink(resolvedAgain!)).toBe(await fs.readlink(resolved!));
    });

    it("a synthetic escalation marker (no dir) does not mask the real latest folder", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      run.stageRuns = [
        { phaseId: "developer", runId: "r1", attempt: 1, status: "done", dir: "01_developer" },
        { phaseId: "developer", runId: "x.developer.escalated", attempt: 1, status: "error" },
      ];
      await expect(resolveOutputSource(run, loopPipeline, "out.md")).resolves.toBe(
        path.join(run.cwd, "01_developer", "out.md"),
      );
    });

    it("recomputeHandoff feeds the latest numbered folder's produces (falls back flat)", () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      const recompute = (r: PipelineRun) =>
        (
          h.service as unknown as {
            recomputeHandoff(run: PipelineRun, p: unknown, cursor: string): string | null;
          }
        ).recomputeHandoff(r, loopPipeline, "code-review");
      run.stageRuns = [
        { phaseId: "developer", runId: "r1", attempt: 1, status: "done", dir: "01_developer" },
        { phaseId: "developer", runId: "r3", attempt: 2, status: "done", dir: "03_developer" },
      ];
      expect(recompute(run)).toBe(path.join(run.cwd, "03_developer", "out.md"));
      // Pre-numbering records (no dir) keep the old flat shape.
      run.stageRuns = [{ phaseId: "developer", runId: "r1", attempt: 1, status: "done" }];
      expect(recompute(run)).toBe(path.join(run.cwd, "developer", "out.md"));
    });

    describe("readArtifact folder lookup", () => {
      it("backcompat: finds an artifact in an old flat phase folder (record without dir)", async () => {
        const run = h.runs.get(PIPELINE_RUN_ID);
        if (!run) throw new Error("missing run");
        run.currentStage = null;
        run.stageRuns = [{ phaseId: "dok", runId: "r1", attempt: 1, status: "done" }];
        await fs.mkdir(path.join(run.cwd, "dok"), { recursive: true });
        await fs.writeFile(path.join(run.cwd, "dok", "docs.md"), "old shape", "utf8");
        const artifact = await h.service.readArtifact(PIPELINE_RUN_ID, "docs.md");
        expect(artifact?.content).toBe("old shape");
      });

      it("reads the LATEST numbered folder when a phase ran more than once", async () => {
        const run = h.runs.get(PIPELINE_RUN_ID);
        if (!run) throw new Error("missing run");
        run.currentStage = null;
        run.stageRuns = [
          { phaseId: "dok", runId: "r1", attempt: 1, status: "done", dir: "01_dok" },
          { phaseId: "dok", runId: "r2", attempt: 2, status: "done", dir: "03_dok" },
        ];
        for (const [dir, body] of [
          ["01_dok", "stale"],
          ["03_dok", "fresh"],
        ] as const) {
          await fs.mkdir(path.join(run.cwd, dir), { recursive: true });
          await fs.writeFile(path.join(run.cwd, dir, "docs.md"), body, "utf8");
        }
        const artifact = await h.service.readArtifact(PIPELINE_RUN_ID, "docs.md");
        expect(artifact?.content).toBe("fresh");
      });

      it("finds the in-flight phase's numbered folder (not yet in stageRuns)", async () => {
        const run = h.runs.get(PIPELINE_RUN_ID);
        if (!run) throw new Error("missing run");
        // Two settled stages; the third dispatch is executing → its folder is 03_*.
        run.currentStage = "dok";
        run.stageRuns = [
          { phaseId: "a", runId: "r1", attempt: 1, status: "done", dir: "01_a" },
          { phaseId: "b", runId: "r2", attempt: 1, status: "done", dir: "02_b" },
        ];
        await fs.mkdir(path.join(run.cwd, "03_dok"), { recursive: true });
        await fs.writeFile(path.join(run.cwd, "03_dok", "docs.md"), "in flight", "utf8");
        const artifact = await h.service.readArtifact(PIPELINE_RUN_ID, "docs.md");
        expect(artifact?.content).toBe("in flight");
      });

      it("P2-T1: a name outside PIPELINE_RUN_ARTIFACTS is allowed when it matches the run's own file output", async () => {
        const run = h.runs.get(PIPELINE_RUN_ID);
        if (!run) throw new Error("missing run");
        run.currentStage = null;
        run.stageRuns = [];
        run.outputsOverride = [
          { type: "file", from: "custom-report.md", dest: "project", to: "docs/report.md" },
        ];
        await fs.writeFile(path.join(run.cwd, "custom-report.md"), "audit findings", "utf8");
        const artifact = await h.service.readArtifact(PIPELINE_RUN_ID, "custom-report.md");
        expect(artifact?.content).toBe("audit findings");
      });

      it("P2-T1: a name outside PIPELINE_RUN_ARTIFACTS and outside outputsOverride is still refused", async () => {
        const run = h.runs.get(PIPELINE_RUN_ID);
        if (!run) throw new Error("missing run");
        run.currentStage = null;
        run.stageRuns = [];
        run.outputsOverride = [
          { type: "file", from: "custom-report.md", dest: "project", to: "docs/report.md" },
        ];
        await fs.writeFile(path.join(run.cwd, "some-other-name.md"), "should not leak", "utf8");
        const artifact = await h.service.readArtifact(PIPELINE_RUN_ID, "some-other-name.md");
        expect(artifact).toBeNull();
      });
    });
  });

  describe("symlink handoff + read-only produces (P1-T2)", () => {
    const twoPhasePipeline = {
      id: "release",
      phases: [
        {
          id: "developer",
          type: "agent",
          agent: "writer",
          consumes: "in.md",
          produces: "out.md",
          model: "sonnet",
          thinking: "medium",
        },
        {
          id: "code-review",
          type: "agent",
          agent: "writer",
          consumes: "out.md",
          produces: "review.md",
          model: "sonnet",
          thinking: "medium",
        },
      ],
      instructions: "ship",
    };

    /**
     * Replace `runStage` with a scriptable double that really writes each phase's
     * `produces` artifact to disk (via the real `write` callback) and reports "done" —
     * so the REAL `placeHandoff`/chmod code in `drive()` runs against real files.
     */
    function scriptRunStage(write: (phaseId: string, cwd: string) => Promise<void>): void {
      (h.service as unknown as { runStage: unknown }).runStage = vi.fn(
        async (_run: unknown, p: { id: string }, cwd: string, attempt: number) => {
          await write(p.id, cwd);
          return {
            phaseId: p.id,
            runId: `${PIPELINE_RUN_ID}.${p.id}_${attempt}`,
            attempt,
            status: "done" as const,
          };
        },
      );
    }

    const drive = (run: PipelineRun, pipeline: unknown) =>
      (h.service as unknown as { drive(r: PipelineRun, p: unknown): Promise<void> }).drive(
        run,
        pipeline,
      );

    it("handoff into the next stage is a relative symlink reading the previous phase's produces", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      scriptRunStage(async (phaseId, cwd) => {
        if (phaseId === "developer") {
          await fs.writeFile(path.join(cwd, "out.md"), "developer output", "utf8");
        }
      });

      await drive(run, twoPhasePipeline);

      expect(run.status).toBe("done");
      const dest = path.join(run.cwd, "02_code-review", "out.md");

      const lst = await fs.lstat(dest);
      expect(lst.isSymbolicLink()).toBe(true);

      // Relative, not absolute — survives moving the whole run folder.
      const linkTarget = await fs.readlink(dest);
      expect(path.isAbsolute(linkTarget)).toBe(false);
      expect(linkTarget).toBe(path.join("..", "01_developer", "out.md"));

      // Reading through the link returns the source's real content.
      expect(await fs.readFile(dest, "utf8")).toBe("developer output");

      // Moving the run root doesn't break the relative link.
      const movedRoot = path.join(dir, "moved-run");
      await fs.rename(run.cwd, movedRoot);
      const movedContent = await fs.readFile(
        path.join(movedRoot, "02_code-review", "out.md"),
        "utf8",
      );
      expect(movedContent).toBe("developer output");
    });

    it("a phase's produces file becomes read-only once the phase completes", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      scriptRunStage(async (phaseId, cwd) => {
        if (phaseId === "developer") await fs.writeFile(path.join(cwd, "out.md"), "v1", "utf8");
        if (phaseId === "code-review") {
          await fs.writeFile(path.join(cwd, "review.md"), "r1", "utf8");
        }
      });

      await drive(run, twoPhasePipeline);

      const producesPath = path.join(run.cwd, "01_developer", "out.md");
      const mode = (await fs.stat(producesPath)).mode;
      // No write bits for owner/group/other.
      expect(mode & 0o222).toBe(0);
      // Real enforcement, not just the bit: a direct write attempt fails.
      await expect(fs.writeFile(producesPath, "corrupt", "utf8")).rejects.toThrow();
      // A subsequent phase's own produces file is read-only too.
      const reviewPath = path.join(run.cwd, "02_code-review", "review.md");
      expect((await fs.stat(reviewPath)).mode & 0o222).toBe(0);
    });

    it("read-only produces files don't block removing the whole run directory (cleanup)", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID);
      if (!run) throw new Error("missing run");
      scriptRunStage(async (phaseId, cwd) => {
        if (phaseId === "developer") await fs.writeFile(path.join(cwd, "out.md"), "v1", "utf8");
        if (phaseId === "code-review") {
          await fs.writeFile(path.join(cwd, "review.md"), "r1", "utf8");
        }
      });

      await drive(run, twoPhasePipeline);

      await expect(fs.rm(run.cwd, { recursive: true, force: true })).resolves.toBeUndefined();
      await expect(fs.access(run.cwd)).rejects.toThrow();
    });
  });

  describe("context/ pipeline-level input folder (P1-T3)", () => {
    /** Drive start() to completion through a scripted runStage (real fs, no core). */
    function scriptRunStage(write: (phaseId: string, cwd: string) => Promise<void>): string[] {
      const cwds: string[] = [];
      (h.service as unknown as { runStage: unknown }).runStage = vi.fn(
        async (_run: unknown, p: { id: string; produces?: string }, cwd: string, attempt: number) => {
          cwds.push(cwd);
          await write(p.id, cwd);
          return {
            phaseId: p.id,
            runId: `${PIPELINE_RUN_ID}.${p.id}_${attempt}`,
            attempt,
            status: "done" as const,
          };
        },
      );
      return cwds;
    }

    const twoPhasePipeline = {
      id: "release",
      phases: [
        {
          id: "a",
          type: "agent",
          agent: "writer",
          consumes: "in.md",
          produces: "out.md",
          model: "sonnet",
          thinking: "medium",
        },
        {
          id: "b",
          type: "agent",
          agent: "writer",
          consumes: "out.md",
          produces: "final.md",
          model: "sonnet",
          thinking: "medium",
        },
      ],
      instructions: "ship",
    };

    it("start() creates a shared context/ folder; every stage gets it via a relative symlink", async () => {
      (
        h.service as unknown as { pipelines: { get: ReturnType<typeof vi.fn> } }
      ).pipelines.get.mockResolvedValue(twoPhasePipeline);
      const cwds = scriptRunStage(async (phaseId, cwd) => {
        await fs.writeFile(path.join(cwd, phaseId === "a" ? "out.md" : "final.md"), "x", "utf8");
      });

      const run = await h.service.start("release");
      await vi.waitFor(() => expect(run.status).toBe("done"));

      const contextDir = path.join(run.cwd, "context");
      expect((await fs.stat(contextDir)).isDirectory()).toBe(true);
      expect(cwds).toHaveLength(2);
      for (const cwd of cwds) {
        const link = path.join(cwd, "context");
        const lst = await fs.lstat(link);
        expect(lst.isSymbolicLink()).toBe(true);
        // Relative — survives moving the whole run folder, same as the handoff link.
        expect(path.isAbsolute(await fs.readlink(link))).toBe(false);
      }
    });

    it("N2b chain input lands in context/input.md, read-only, symlinked as the first phase's consumes", async () => {
      const onePhasePipeline = {
        id: "release",
        phases: [twoPhasePipeline.phases[0]],
        instructions: "ship",
      };
      (
        h.service as unknown as { pipelines: { get: ReturnType<typeof vi.fn> } }
      ).pipelines.get.mockResolvedValue(onePhasePipeline);
      scriptRunStage(async (_phaseId, cwd) => {
        await fs.writeFile(path.join(cwd, "out.md"), "done", "utf8");
      });

      const run = await h.service.start(
        "release",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "chain content here",
      );
      await vi.waitFor(() => expect(run.status).toBe("done"));

      const inputPath = path.join(run.cwd, "context", "input.md");
      expect(await fs.readFile(inputPath, "utf8")).toBe("chain content here");
      expect((await fs.stat(inputPath)).mode & 0o222).toBe(0); // read-only

      const consumesLink = path.join(run.cwd, "01_a", "in.md");
      const lst = await fs.lstat(consumesLink);
      expect(lst.isSymbolicLink()).toBe(true);
      expect(path.isAbsolute(await fs.readlink(consumesLink))).toBe(false);
      expect(await fs.readFile(consumesLink, "utf8")).toBe("chain content here");
    });
  });
});
