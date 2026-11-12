import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type WorkflowRun, WorkflowSchema } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpawnOneShotOptions } from "../shared/spawn-one-shot";
import type { WorkflowsStorageService } from "./workflows.storage.service";
import type { WorkflowRunnerService } from "./workflow-runner.service";
import { PhaseAdvisorService, handoffProducer, parseAdvisorReply } from "./phase-advisor.service";

const phase = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  agent: id,
  consumes: "plan.md",
  produces: "plan.md",
  model: "sonnet",
  thinking: "medium",
  ...extra,
});

type Call = SpawnOneShotOptions & { claudeArgs: string[] };

const reply = (result: string, cost = 0.42) =>
  JSON.stringify({ type: "result", result, total_cost_usd: cost, is_error: false });

describe("PhaseAdvisorService", () => {
  let dir: string;
  let run: WorkflowRun;
  let sessions: Record<string, { cwd: string; sessionId?: string; engine?: "opencode" }>;
  let advisor: Record<string, unknown> | undefined;
  let spawn: ReturnType<typeof vi.fn>;
  let service: PhaseAdvisorService;

  const koderCwd = () => path.join(dir, "02-koder");

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "advisor-"));
    await fs.mkdir(path.join(dir, "01-architekt"));
    await fs.writeFile(path.join(dir, "01-architekt", "plan.md"), "# Plan\n1. run the generator");
    await fs.mkdir(koderCwd());
    await fs.symlink("../01-architekt/plan.md", path.join(koderCwd(), "plan.md"));
    run = {
      workflowRunId: "delivery_1",
      workflowId: "delivery",
      status: "running",
      currentStage: "koder",
      currentStageRunId: "s2",
      stageRuns: [
        { phaseId: "architekt", runId: "s1", attempt: 1, status: "done", dir: "01-architekt" },
      ],
      startedAt: new Date().toISOString(),
      cwd: dir,
      workspace: { path: "/wt" },
    } as unknown as WorkflowRun;
    sessions = {
      s1: { cwd: path.join(dir, "01-architekt"), sessionId: "sess-arch" },
      s2: { cwd: koderCwd() },
    };
    advisor = { model: "opus", thinking: "high", maxCalls: 2 };
    const runs = {
      get: (id: string) => {
        if (id !== run.workflowRunId) throw new Error("not found");
        return run;
      },
      stageInfo: (id: string) => sessions[id] ?? null,
    } as unknown as WorkflowRunnerService;
    const workflows = {
      get: async () =>
        WorkflowSchema.parse({
          id: "delivery",
          phases: [phase("architekt"), phase("koder"), phase("review")],
          instructions: "x",
          ...(advisor ? { advisor } : {}),
        }),
    } as unknown as WorkflowsStorageService;
    service = new PhaseAdvisorService(runs, workflows);
    spawn = vi.fn(async () =>
      reply("Approved: keep the hand-written schema, note it in the handoff."),
    );
    service.spawn = spawn as unknown as PhaseAdvisorService["spawn"];
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("answers from a fork of the architekt session and writes the audit note + cost", async () => {
    const text = await service.ask("delivery_1", "Skip the generator?");
    expect(text).toContain("Approved: keep the hand-written schema");
    const call = spawn.mock.calls[0]?.[0] as Call;
    const args = call.claudeArgs;
    expect(call.cwd).toBe("/wt");
    expect(call.engine).toBe("claude");
    expect(args).toEqual(expect.arrayContaining(["--resume", "sess-arch", "--fork-session"]));
    expect(call.tier).toBe("opus");
    expect(args).toEqual(expect.arrayContaining(["--effort", "high"]));
    const allowed = args.slice(args.indexOf("--allowedTools") + 1).slice(0, 3);
    expect(allowed).toEqual(["Read", "Grep", "Glob"]);
    expect(args).toEqual(expect.arrayContaining(["--permission-mode", "dontAsk"]));
    expect(args[args.indexOf("--disallowedTools") + 1]).toBe("Bash");
    // The token-dir guard rides along on the read tools only.
    const settings = JSON.parse(args[args.indexOf("--settings") + 1] ?? "{}") as {
      hooks: { PreToolUse: Array<{ matcher: string }> };
    };
    expect(settings.hooks.PreToolUse.map((g) => g.matcher)).toEqual(["Read|Grep|Glob"]);
    expect(args).not.toContain("--mcp-config");
    const prompt = call.prompt;
    expect(prompt).toContain("Skip the generator?");
    expect(prompt).toContain("1. run the generator");
    expect(prompt).toContain("ESCALATE:");

    const note = await fs.readFile(path.join(koderCwd(), "advisor", "01.md"), "utf8");
    expect(note).toContain("Skip the generator?");
    expect(note).toContain("Approved: keep the hand-written schema");
    expect(note).toContain("opus");
    expect(note).toContain("architekt");
    expect(note).toContain("0.42");
    const costs = await fs.readFile(path.join(koderCwd(), "costs.jsonl"), "utf8");
    expect(JSON.parse(costs.trim())).toMatchObject({ costUsd: 0.42, source: "advisor" });
  });

  it("runs on opencode for an opencode stage and forks its opencode session (A32)", async () => {
    sessions.s1 = {
      cwd: path.join(dir, "01-architekt"),
      sessionId: "ses_arch",
      engine: "opencode",
    };
    sessions.s2 = { cwd: koderCwd(), engine: "opencode" };
    const text = await service.ask("delivery_1", "Skip the generator?");
    expect(text).toContain("Approved");
    const call = spawn.mock.calls[0]?.[0] as Call;
    expect(call).toMatchObject({
      engine: "opencode",
      tier: "opus",
      thinking: "high",
      tools: "read-guarded",
      forkSession: "ses_arch",
      cwd: "/wt",
    });
  });

  it("never forks a session across engines (claude source, opencode stage)", async () => {
    sessions.s2 = { cwd: koderCwd(), engine: "opencode" };
    await service.ask("delivery_1", "q");
    const call = spawn.mock.calls[0]?.[0] as Call;
    expect(call.engine).toBe("opencode");
    expect(call.forkSession).toBeUndefined();
    expect(call.prompt).toContain("You start fresh");
  });

  it("on a loop retry resumes the review phase that wrote the failure context", async () => {
    await fs.writeFile(path.join(dir, "review.failure.txt"), "gap: schema not generated");
    await fs.rm(path.join(koderCwd(), "plan.md"));
    await fs.symlink("../review.failure.txt", path.join(koderCwd(), "plan.md"));
    run.stageRuns.push({
      phaseId: "review",
      runId: "s3",
      attempt: 1,
      status: "error",
      dir: "03-review",
    });
    sessions.s3 = { cwd: path.join(dir, "03-review"), sessionId: "sess-review" };
    await service.ask("delivery_1", "Retry how?");
    const call = spawn.mock.calls[0]?.[0] as Call;
    expect(call.claudeArgs).toEqual(expect.arrayContaining(["--resume", "sess-review"]));
  });

  it("falls back to a fresh session when the source phase captured none", async () => {
    delete sessions.s1?.sessionId;
    await service.ask("delivery_1", "q");
    const call = spawn.mock.calls[0]?.[0] as Call;
    expect(call.claudeArgs).not.toContain("--resume");
  });

  it("retries fresh once when the resume itself fails", async () => {
    spawn.mockRejectedValueOnce(new Error("No conversation found"));
    const text = await service.ask("delivery_1", "q");
    expect(spawn).toHaveBeenCalledTimes(2);
    expect((spawn.mock.calls[1]?.[0] as Call).claudeArgs).not.toContain("--resume");
    expect(text).toContain("Approved");
  });

  it("routes an ESCALATE reply to ask_operator", async () => {
    spawn.mockResolvedValueOnce(reply("ESCALATE: dropping the generator changes the AC"));
    const text = await service.ask("delivery_1", "Drop the generator step?");
    expect(text).toContain("ask_operator");
    expect(text).toContain("dropping the generator changes the AC");
    expect(await fs.readdir(path.join(koderCwd(), "advisor"))).toEqual(["01.md"]);
  });

  it("routes an ESCALATE line anywhere in the reply to ask_operator", async () => {
    spawn.mockResolvedValueOnce(reply("Understood.\nESCALATE: changes AC"));
    const text = await service.ask("delivery_1", "Drop the generator step?");
    expect(text).toContain("ask_operator");
    expect(text).toContain("changes AC");
    const note = await fs.readFile(path.join(koderCwd(), "advisor", "01.md"), "utf8");
    expect(note).toContain("outcome: escalate");
  });

  it("frames an answer as guidance under the gate", async () => {
    const text = await service.ask("delivery_1", "q");
    expect(text).toContain(
      "Treat this as guidance; the gate still applies; record the decision in your handoff.",
    );
  });

  it("refuses without spawning once the run's spend reached its cap", async () => {
    run.budget = { maxCostUsd: 1, warnAtPct: 70, spentUsd: 0.8 };
    await fs.writeFile(path.join(koderCwd(), "costs.jsonl"), '{"costUsd":0.3}\n');
    const text = await service.ask("delivery_1", "q");
    expect(spawn).not.toHaveBeenCalled();
    expect(text).toContain("budget");
    expect(text).toContain("ask_operator");
  });

  it("resumes in the source stage's cwd when the run has no worktree or project", async () => {
    delete (run as { workspace?: unknown }).workspace;
    await service.ask("delivery_1", "q");
    const call = spawn.mock.calls[0]?.[0] as { cwd: string };
    expect(call.cwd).toBe(path.join(dir, "01-architekt"));
  });

  it("stops at maxCalls and sends the agent to ask_operator without spawning", async () => {
    await service.ask("delivery_1", "one");
    await service.ask("delivery_1", "two");
    const text = await service.ask("delivery_1", "three");
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(text).toContain("ask_operator");
    expect(text).toContain("2");
  });

  it("sends the agent to ask_operator when no advisor is configured", async () => {
    advisor = undefined;
    const text = await service.ask("delivery_1", "q");
    expect(spawn).not.toHaveBeenCalled();
    expect(text).toContain("ask_operator");
  });

  it("sends the agent to ask_operator for an unknown run (e.g. a bare agent run)", async () => {
    const text = await service.ask("agent_123", "q");
    expect(spawn).not.toHaveBeenCalled();
    expect(text).toContain("ask_operator");
  });

  it("records a failed advisor call and sends the agent to ask_operator", async () => {
    delete sessions.s1?.sessionId;
    spawn.mockRejectedValueOnce(new Error("advisor timed out"));
    const text = await service.ask("delivery_1", "q");
    expect(text).toContain("ask_operator");
    const note = await fs.readFile(path.join(koderCwd(), "advisor", "01.md"), "utf8");
    expect(note).toContain("advisor timed out");
  });
});

describe("handoffProducer", () => {
  it("maps a stage-dir handoff and a failure-context handoff to their phases", () => {
    const run = {
      cwd: "/r",
      stageRuns: [{ phaseId: "architekt", dir: "01-architekt" }],
    } as unknown as WorkflowRun;
    expect(handoffProducer(run, "/r/01-architekt/plan.md")).toBe("architekt");
    expect(handoffProducer(run, "/r/review.failure.txt")).toBe("review");
    expect(handoffProducer(run, "/elsewhere/x.md")).toBeUndefined();
  });
});

describe("parseAdvisorReply", () => {
  it("reads result, cost and an ESCALATE marker", () => {
    expect(parseAdvisorReply(reply("Use plan B", 1.5))).toEqual({
      answer: "Use plan B",
      costUsd: 1.5,
    });
    expect(parseAdvisorReply(reply("  ESCALATE: scope grows")).escalate).toBe("scope grows");
  });

  it("throws on an error result", () => {
    expect(() =>
      parseAdvisorReply(JSON.stringify({ result: "boom", is_error: true, total_cost_usd: 0 })),
    ).toThrow();
  });
});
