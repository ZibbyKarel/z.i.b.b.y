import { promises as fs, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ORCHESTRATOR_ID } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, IntendedAction } from "@zibby/contracts";
import type { AgentsStorageService } from "./agents.storage.service";
import type { HooksStorageService } from "../hooks/hooks.storage.service";
import { GateEvaluatorService } from "../gates/gate-evaluator.service";
import { PolicyStorageService } from "../gates/policy.storage.service";
import type { McpCredentialsStore } from "../mcp/mcp-credentials.store";
import type { McpServersStorageService } from "../mcp/mcp.storage.service";
import type { SkillsStorageService } from "../skills/skills.storage.service";
import { ClaudeRunCommandService } from "../runner/claude-run-command.service";
import type { AgentRunRecord } from "./agent-run.record";
import { AgentRunnerService, intersectToolGrants } from "./agent-runner.service";

/**
 * `buildCommand` is private and only ever touches `this.claude`. We construct the
 * runner without its 14-dep DI graph: a bare prototype with `claude` set to a real
 * {@link ClaudeRunCommandService} backed by empty `.list()` stores (its mcp/hooks/
 * skills lookups all fail-open to `[]`, and `mcpCredentials` is never read with zero
 * mcp servers). This exercises the true task/`--add-dir` assembly.
 */
function makeRunner(): AgentRunnerService {
  // Phase 4c: the agents store also needs `listActive` (the delegation-catalog
  // seam `ClaudeRunCommandService.buildCatalog` reads) — harmless no-op extra
  // property on the other (skills/hooks/mcp) stores sharing this fixture.
  const emptyStore = { list: async () => [], listActive: async () => [] };
  const claude = new ClaudeRunCommandService(
    emptyStore as unknown as AgentsStorageService,
    emptyStore as unknown as SkillsStorageService,
    emptyStore as unknown as HooksStorageService,
    emptyStore as unknown as McpServersStorageService,
    {} as unknown as McpCredentialsStore,
  );
  const runner = Object.create(AgentRunnerService.prototype) as AgentRunnerService;
  (runner as unknown as { claude: ClaudeRunCommandService }).claude = claude;
  return runner;
}

const agentFixture = {
  instructions: "sys",
  tools: [],
  model: "claude-x",
  thinking: undefined,
} as unknown as Agent;

type BuildCommand = (
  agent: Agent,
  prompt: string,
  grantDirs: string[],
  grounding?: string,
  sandboxCwd?: string,
  attachments?: { dir: string; names: string[] },
  resumeSessionId?: string,
  toolGrants?: string[],
) => Promise<{ command: string; args: string[] }>;

describe("AgentRunnerService.buildCommand attachments", () => {
  it("grants the attachments dir and lists filenames without making it the operate target", async () => {
    const runner = makeRunner();
    const sandbox = mkdtempSync(join(tmpdir(), "zibby-agent-runner-"));
    const built = await (runner as unknown as { buildCommand: BuildCommand }).buildCommand(
      agentFixture,
      "do the thing",
      ["/work/proj"],
      "",
      sandbox,
      { dir: "/data/tasks/attachments/set_1", names: ["spec.pdf", "data.csv"] },
    );
    const joined = built.args.join(" ");
    expect(joined).toContain("--add-dir");
    expect(joined).toContain("/data/tasks/attachments/set_1");

    const taskArg = built.args[built.args.indexOf("-p") + 1] ?? built.args.join("\n");
    expect(taskArg).toContain("Operate on this directory: /work/proj");
    expect(taskArg).toContain(
      "attached reference files in /data/tasks/attachments/set_1: spec.pdf, data.csv",
    );
  });

  it("drops a relative attachments dir (no grant, no manifest line)", async () => {
    const runner = makeRunner();
    const sandbox = mkdtempSync(join(tmpdir(), "zibby-agent-runner-"));
    const built = await (runner as unknown as { buildCommand: BuildCommand }).buildCommand(
      agentFixture,
      "do the thing",
      ["/work/proj"],
      "",
      sandbox,
      { dir: "relative/attachments", names: ["spec.pdf"] },
    );
    const joined = built.args.join(" ");
    expect(joined).not.toContain("relative/attachments");
    const taskArg = built.args[built.args.indexOf("-p") + 1] ?? built.args.join("\n");
    expect(taskArg).not.toContain("attached reference files");
    expect(taskArg).toContain("Operate on this directory: /work/proj");
  });
});

describe("intersectToolGrants (Phase 108 ceiling enforcement)", () => {
  const agentWithCeiling = { optionalTools: ["recall_memory", "list_entities"] } as unknown as Agent;

  it("keeps a grant that's inside the agent's optionalTools ceiling", () => {
    expect(intersectToolGrants(["recall_memory"], agentWithCeiling)).toEqual(["recall_memory"]);
  });

  it("silently drops an ungranted id — never throws", () => {
    expect(intersectToolGrants(["recall_memory", "delete_everything"], agentWithCeiling)).toEqual([
      "recall_memory",
    ]);
  });

  it("returns [] when the operator confirmed nothing", () => {
    expect(intersectToolGrants(undefined, agentWithCeiling)).toEqual([]);
    expect(intersectToolGrants([], agentWithCeiling)).toEqual([]);
  });

  it("returns [] when the agent has no optionalTools ceiling at all (today's memory-blind default)", () => {
    const bare = {} as unknown as Agent;
    expect(intersectToolGrants(["recall_memory"], bare)).toEqual([]);
  });
});

describe("AgentRunnerService.buildCommand toolGrants → allowedTools (Phase 108)", () => {
  it("unions a granted MCP tool id into --allowedTools, qualified against the entity-directory server", async () => {
    const runner = Object.create(AgentRunnerService.prototype) as AgentRunnerService;
    const claude = new ClaudeRunCommandService(
      { list: async () => [], listActive: async () => [] } as unknown as AgentsStorageService,
      { list: async () => [] } as unknown as SkillsStorageService,
      { list: async () => [] } as unknown as HooksStorageService,
      // The enabled zibby-entities row — buildCatalog reconciles the bare grant id
      // "recall_memory" against it (mcp__zibby-entities__recall_memory).
      {
        list: async () => [{ id: "zibby-entities", enabled: true, type: "http", url: "http://x" }],
      } as unknown as McpServersStorageService,
      { read: async () => null } as unknown as McpCredentialsStore,
    );
    (runner as unknown as { claude: ClaudeRunCommandService }).claude = claude;
    const sandbox = mkdtempSync(join(tmpdir(), "zibby-agent-runner-"));
    const built = await (runner as unknown as { buildCommand: BuildCommand }).buildCommand(
      agentFixture,
      "recall what we know",
      [],
      "",
      sandbox,
      undefined,
      undefined,
      ["recall_memory"],
    );
    const joined = built.args.join(" ");
    expect(joined).toContain("mcp__zibby-entities__recall_memory");
  });

  it("an already-dropped (ungranted) id never reaches buildCommand — the ceiling was enforced upstream in launch()", async () => {
    const runner = makeRunner();
    const sandbox = mkdtempSync(join(tmpdir(), "zibby-agent-runner-"));
    // No zibby-entities server enabled here — a bare grant id has nothing to
    // qualify against, so it's dropped fail-open (never thrown, never a bare
    // "delete_everything" landing verbatim in --allowedTools).
    const built = await (runner as unknown as { buildCommand: BuildCommand }).buildCommand(
      agentFixture,
      "do the thing",
      [],
      "",
      sandbox,
      undefined,
      undefined,
      ["delete_everything"],
    );
    const joined = built.args.join(" ");
    expect(joined).not.toContain("delete_everything");
  });
});

/**
 * `evaluateIntent` is private and only ever touches `this.core` / `this.agents` /
 * `this.gates` / `this.approvals` / `this.log` — a bare prototype instance with
 * those four wired (plus a no-op logger) exercises the real gate composition
 * without the full 14-dep DI graph. `gates` is a REAL {@link GateEvaluatorService}
 * over a temp-dir {@link PolicyStorageService} (seeded with the default floor), so
 * these tests exercise the actual strictest-union math, not a stub.
 */
const noopLog = { debug() {}, info() {}, warn() {}, error() {} };

type EvaluateIntent = (runId: string, action: IntendedAction) => Promise<void>;

interface IntentHarness {
  runner: AgentRunnerService;
  core: {
    get: (id: string) => AgentRunRecord;
    denyIntent: ReturnType<typeof vi.fn>;
    holdForApproval: ReturnType<typeof vi.fn>;
    allowIntent: ReturnType<typeof vi.fn>;
  };
  approvals: { requestApproval: ReturnType<typeof vi.fn> };
}

function makeIntentHarness(rec: AgentRunRecord, storedAgents: Agent[] = []): IntentHarness {
  const core = {
    get: (id: string) => {
      if (id !== rec.runId) throw new Error(`unknown run ${id}`);
      return rec;
    },
    denyIntent: vi.fn(async () => {}),
    holdForApproval: vi.fn(async () => {}),
    allowIntent: vi.fn(async () => {}),
  };
  const agentsById = new Map(storedAgents.map((a) => [a.id, a]));
  const agents = {
    get: async (id: string) => {
      const found = agentsById.get(id);
      if (!found) throw new Error(`agent ${id} not found`);
      return found;
    },
  };
  const approvals = { requestApproval: vi.fn(async () => {}) };
  const runner = Object.create(AgentRunnerService.prototype) as AgentRunnerService;
  Object.assign(runner as unknown as Record<string, unknown>, {
    core,
    agents,
    approvals,
    log: noopLog,
  });
  return { runner, core, approvals };
}

const baseRec = (over: Partial<AgentRunRecord> = {}): AgentRunRecord =>
  ({
    runId: "run-1",
    kind: "agent",
    status: "running",
    pct: 10,
    cwd: "/tmp/run-1",
    startedAt: new Date().toISOString(),
    pid: 1,
    logFile: "/tmp/run-1.log",
    agentId: "coder",
    prompt: "do the thing",
    project: "",
    files: [],
    title: "",
    ...over,
  }) as AgentRunRecord;

const delegateAction: IntendedAction = { action: "agent.delegate", scope: "cleaner" };

describe("AgentRunnerService.evaluateIntent (Fáze 2b — orchestrator strictest union)", () => {
  let policyDir: string;
  let gates: GateEvaluatorService;

  beforeEach(async () => {
    policyDir = mkdtempSync(join(tmpdir(), "zibby-policy-"));
    const policy = new PolicyStorageService(policyDir);
    await policy.onModuleInit();
    gates = new GateEvaluatorService(policy);
  });
  afterEach(async () => {
    await fs.rm(policyDir, { recursive: true, force: true });
  });

  it("a non-orchestrator run evaluates on its OWN agent alone (unchanged behaviour)", async () => {
    const rec = baseRec({ agentId: "coder" });
    const coder: Agent = {
      id: "coder",
      instructions: "x",
      gates: [{ match: [{ type: "action", action: "agent.delegate" }], decision: "deny" }],
    };
    const { runner, core } = makeIntentHarness(rec, [coder]);
    Object.assign(runner as unknown as Record<string, unknown>, { gates });
    await (runner as unknown as { evaluateIntent: EvaluateIntent }).evaluateIntent(
      rec.runId,
      delegateAction,
    );
    expect(core.denyIntent).toHaveBeenCalledWith(rec.runId);
  });

  it("an orchestrator run with no catalog rules falls through to the (default-allow) floor", async () => {
    const rec = baseRec({ agentId: ORCHESTRATOR_ID, catalogAgentIds: ["cleaner"] });
    const cleaner: Agent = { id: "cleaner", instructions: "x" };
    const { runner, core } = makeIntentHarness(rec, [cleaner]);
    Object.assign(runner as unknown as Record<string, unknown>, { gates });
    await (runner as unknown as { evaluateIntent: EvaluateIntent }).evaluateIntent(
      rec.runId,
      delegateAction,
    );
    expect(core.allowIntent).toHaveBeenCalledWith(rec.runId);
  });

  it("an orchestrator run inherits a catalog subagent's OWN deny rule (mitigates Zjištění 3a's dropped hardening)", async () => {
    const rec = baseRec({ agentId: ORCHESTRATOR_ID, catalogAgentIds: ["cleaner"] });
    const cleaner: Agent = {
      id: "cleaner",
      instructions: "x",
      // The subagent's own hardening: never delegate to it without a human.
      gates: [{ match: [{ type: "action", action: "agent.delegate" }], decision: "deny" }],
    };
    const { runner, core } = makeIntentHarness(rec, [cleaner]);
    Object.assign(runner as unknown as Record<string, unknown>, { gates });
    await (runner as unknown as { evaluateIntent: EvaluateIntent }).evaluateIntent(
      rec.runId,
      delegateAction,
    );
    // Evaluated under the ORCHESTRATOR's identity, yet the subagent's own rule still
    // fires — this is the strictest-union mitigation, not the orchestrator's rules.
    expect(core.denyIntent).toHaveBeenCalledWith(rec.runId);
    expect(core.allowIntent).not.toHaveBeenCalled();
  });

  it("takes the strictest of orchestrator + several catalog agents (ask beats allow, deny beats ask)", async () => {
    const rec = baseRec({
      agentId: ORCHESTRATOR_ID,
      catalogAgentIds: ["quiet-one", "asks-first"],
    });
    const quietOne: Agent = { id: "quiet-one", instructions: "x" };
    const asksFirst: Agent = { id: "asks-first", instructions: "x", requires_approval: true };
    const { runner, core, approvals } = makeIntentHarness(rec, [quietOne, asksFirst]);
    Object.assign(runner as unknown as Record<string, unknown>, { gates });
    await (runner as unknown as { evaluateIntent: EvaluateIntent }).evaluateIntent(
      rec.runId,
      delegateAction,
    );
    expect(core.holdForApproval).toHaveBeenCalledWith(rec.runId);
    expect(approvals.requestApproval).toHaveBeenCalledTimes(1);
    expect(core.denyIntent).not.toHaveBeenCalled();
    expect(core.allowIntent).not.toHaveBeenCalled();
  });

  it("a deleted catalog agent is skipped tolerantly, not a hard failure", async () => {
    const rec = baseRec({ agentId: ORCHESTRATOR_ID, catalogAgentIds: ["gone"] });
    const { runner, core } = makeIntentHarness(rec, []); // "gone" is not in storage
    Object.assign(runner as unknown as Record<string, unknown>, { gates });
    await (runner as unknown as { evaluateIntent: EvaluateIntent }).evaluateIntent(
      rec.runId,
      delegateAction,
    );
    // No agent's rules to inherit → falls through to the default-allow floor, same
    // as an orchestrator run with an empty catalog — never a thrown/failed run.
    expect(core.allowIntent).toHaveBeenCalledWith(rec.runId);
  });
});

/**
 * Fáze 2c fixation: a run dispatched through the task-classifier's orchestrator
 * fallback (`ORCHESTRATOR_TARGET` → `startOrchestrator` → `agentId: ORCHESTRATOR_ID`,
 * see `task-scheduler.service.ts`) must go through the exact same `evaluateIntent`
 * gate path as any explicitly-named agent run — not a pipeline-only or bypassed
 * path. This is exactly the orchestrator branch above; asserted once more here,
 * directly against `ORCHESTRATOR_ID`, as the named regression for that routing.
 */
describe("AgentRunnerService.evaluateIntent — classifier-fallback orchestrator run is gated identically", () => {
  it("gates a run whose agentId is the reserved ORCHESTRATOR_ID exactly like a named-agent run", async () => {
    const policyDir = mkdtempSync(join(tmpdir(), "zibby-policy-"));
    const policy = new PolicyStorageService(policyDir);
    await policy.onModuleInit();
    const gates = new GateEvaluatorService(policy);
    try {
      const rec = baseRec({ agentId: ORCHESTRATOR_ID, catalogAgentIds: [] });
      const { runner, core } = makeIntentHarness(rec, []);
      Object.assign(runner as unknown as Record<string, unknown>, { gates });
      // A floor action (delete) still pauses for approval even with an empty catalog —
      // bounded execution is preserved for the fallback path, same as any named agent.
      await (runner as unknown as { evaluateIntent: EvaluateIntent }).evaluateIntent(rec.runId, {
        action: "delete",
      });
      expect(core.holdForApproval).toHaveBeenCalledWith(rec.runId);
    } finally {
      await fs.rm(policyDir, { recursive: true, force: true });
    }
  });
});
