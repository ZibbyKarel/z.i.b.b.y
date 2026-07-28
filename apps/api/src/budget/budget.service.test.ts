import type { AgentRun, Limits, PipelineRun, Project } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { BudgetService } from "./budget.service";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

const limits = (over: Partial<Limits> = {}): Limits => ({
  rolling: { usedPct: 10, resetsAt: null },
  weekly: { usedPct: 10, resetsAt: null },
  capturedAt: null,
  stale: false,
  ...over,
});

const zeroCostStats = async () => ({ sum: 0, count: 0 });

interface Deps {
  ledger?: Partial<{
    countDaily: () => Promise<number>;
    countWeekly: () => Promise<number>;
    countMonthly: () => Promise<number>;
    sumCostDaily: () => Promise<{ sum: number; count: number }>;
    sumCostWeekly: () => Promise<{ sum: number; count: number }>;
    sumCostMonthly: () => Promise<{ sum: number; count: number }>;
    record: () => Promise<void>;
    recordCost: () => Promise<void>;
  }>;
  config?: { read: () => Promise<Record<string, number>> };
  project?: Project | null;
  limitsSnapshot?: () => Promise<Limits>;
  agentRuns?: AgentRun[];
  pipelineRuns?: PipelineRun[];
  /** Phase 70: override the effective budget the resolver returns (default: echoes `project.budget`). */
  resolveBudget?: (project: Project) => Promise<Project["budget"]>;
}

function build(deps: Deps = {}): BudgetService {
  const ledger = {
    countDaily: deps.ledger?.countDaily ?? (async () => 0),
    countWeekly: deps.ledger?.countWeekly ?? (async () => 0),
    countMonthly: deps.ledger?.countMonthly ?? (async () => 0),
    sumCostDaily: deps.ledger?.sumCostDaily ?? zeroCostStats,
    sumCostWeekly: deps.ledger?.sumCostWeekly ?? zeroCostStats,
    sumCostMonthly: deps.ledger?.sumCostMonthly ?? zeroCostStats,
    record: deps.ledger?.record ?? (async () => {}),
    recordCost: deps.ledger?.recordCost ?? (async () => {}),
  };
  const config = deps.config ?? { read: async () => ({}) };
  const projects = {
    get: async (id: string) => {
      if (deps.project && deps.project.id === id) return deps.project;
      throw new Error("not found");
    },
    list: async () => (deps.project ? [deps.project] : []),
  };
  const limitsService = { snapshot: deps.limitsSnapshot ?? (async () => limits()) };
  const agentRunner = { listRunning: () => deps.agentRuns ?? [] };
  const pipelineRunner = { list: () => deps.pipelineRuns ?? [] };
  const tasks = { list: async () => [] };
  // Phase 70: with no `resolveBudget` override, the fake just echoes `project.budget`
  // through (no company in play), matching BudgetService's pre-Phase-70 direct-access
  // behavior exactly. The resolver's own merge rules are unit-tested in
  // resolved-project.helpers.test.ts; `resolveBudget` below covers BudgetService
  // actually routing through the resolver rather than reading `project.budget` itself.
  const resolved = { resolveBudget: deps.resolveBudget ?? (async (p: Project) => p.budget) };
  return new BudgetService(
    ledger as never,
    config as never,
    projects as never,
    resolved as never,
    limitsService as never,
    agentRunner as never,
    pipelineRunner as never,
    tasks as never,
    fakeLogger as never,
  );
}

const project = (budget: Project["budget"]): Project => ({
  id: "alpha",
  name: "Alpha",
  path: "/work/alpha",
  budget,
});

describe("BudgetService.check — caps arithmetic", () => {
  it("ok when the project has no budget", async () => {
    const svc = build({ project: project(undefined) });
    expect(await svc.check("alpha")).toEqual({ ok: true });
  });

  it("Phase 70: enforces the resolver's EFFECTIVE budget, not the project's own raw `budget`", async () => {
    // The project itself has NO budget set at all — a company-inherited daily cap
    // (surfaced only via the resolver) must still be enforced. Proves `check()`
    // routes through ResolvedProjectService.resolveBudget rather than `project.budget`.
    const svc = build({
      project: project(undefined),
      resolveBudget: async () => ({ dailyRuns: 2 }),
      ledger: { countDaily: async () => 2 },
    });
    const result = await svc.check("alpha");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.over).toBe("project-daily");
  });

  it("ok when under the daily cap", async () => {
    const svc = build({
      project: project({ dailyRuns: 2 }),
      ledger: { countDaily: async () => 1 },
    });
    expect(await svc.check("alpha")).toEqual({ ok: true });
  });

  it("over when the daily cap is reached", async () => {
    const svc = build({
      project: project({ dailyRuns: 2 }),
      ledger: { countDaily: async () => 2 },
    });
    const result = await svc.check("alpha");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.over).toBe("project-daily");
  });

  it("over when the weekly cap is reached", async () => {
    const svc = build({
      project: project({ weeklyRuns: 5 }),
      ledger: { countWeekly: async () => 5 },
    });
    const result = await svc.check("alpha");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.over).toBe("project-weekly");
  });

  it("over when the monthly cap is reached", async () => {
    const svc = build({
      project: project({ monthlyRuns: 20 }),
      ledger: { countMonthly: async () => 20 },
    });
    const result = await svc.check("alpha");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.over).toBe("project-monthly");
  });

  it("ok when under the monthly cap", async () => {
    const svc = build({
      project: project({ monthlyRuns: 20 }),
      ledger: { countMonthly: async () => 5 },
    });
    expect(await svc.check("alpha")).toEqual({ ok: true });
  });

  it("ok for an unattributed dispatch (no projectId, no global pause)", async () => {
    const svc = build();
    expect(await svc.check(undefined)).toEqual({ ok: true });
  });
});

describe("BudgetService.check — global ceiling", () => {
  it("holds when a non-stale window is at the pause threshold", async () => {
    const svc = build({
      config: { read: async () => ({ pauseAtRollingPct: 80 }) },
      limitsSnapshot: async () => limits({ rolling: { usedPct: 85, resetsAt: null } }),
    });
    const result = await svc.check(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.over).toBe("global");
  });

  it("ignores the threshold when the reading is stale", async () => {
    const svc = build({
      config: { read: async () => ({ pauseAtRollingPct: 80 }) },
      limitsSnapshot: async () => limits({ rolling: { usedPct: 95, resetsAt: null }, stale: true }),
    });
    expect(await svc.check(undefined)).toEqual({ ok: true });
  });
});

describe("BudgetService.check — fail-closed", () => {
  it("holds (over global) when the limits snapshot throws", async () => {
    const svc = build({
      limitsSnapshot: async () => {
        throw new Error("network down");
      },
    });
    const result = await svc.check("alpha");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.over).toBe("global");
  });

  it("holds (over global) when the ledger is unreadable", async () => {
    const svc = build({
      project: project({ dailyRuns: 1 }),
      ledger: {
        countDaily: async () => {
          throw new Error("EACCES");
        },
      },
    });
    const result = await svc.check("alpha");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.over).toBe("global");
  });
});

describe("BudgetService.check — dollar caps (Phase 12)", () => {
  it("ok when under the daily cost cap", async () => {
    const svc = build({
      project: project({ dailyCostCapUsd: 10 }),
      ledger: { sumCostDaily: async () => ({ sum: 4, count: 2 }) }, // avg 2 → estimate 6
    });
    expect(await svc.check("alpha")).toEqual({ ok: true });
  });

  it("over when spent + average run cost would cross the daily cost cap, and carries metrics", async () => {
    const svc = build({
      project: project({ dailyCostCapUsd: 10 }),
      ledger: { sumCostDaily: async () => ({ sum: 9, count: 3 }) }, // avg 3 → estimate 12
    });
    const result = await svc.check("alpha");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.over).toBe("project-daily-cost");
    expect(result.metrics).toEqual({ costUsd: 12, capUsd: 10 });
  });

  it("over when the weekly cost cap is crossed", async () => {
    const svc = build({
      project: project({ weeklyCostCapUsd: 5 }),
      ledger: { sumCostWeekly: async () => ({ sum: 6, count: 1 }) }, // avg 6 → estimate 12
    });
    const result = await svc.check("alpha");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.over).toBe("project-weekly-cost");
  });

  it("over when the monthly cost cap is crossed", async () => {
    const svc = build({
      project: project({ monthlyCostCapUsd: 20 }),
      ledger: { sumCostMonthly: async () => ({ sum: 21, count: 1 }) },
    });
    const result = await svc.check("alpha");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.over).toBe("project-monthly-cost");
  });

  it("with no cost line yet, the estimate is spent-only (avg 0) and stays under the cap", async () => {
    const svc = build({
      project: project({ dailyCostCapUsd: 1 }),
      ledger: { sumCostDaily: async () => ({ sum: 0, count: 0 }) },
    });
    expect(await svc.check("alpha")).toEqual({ ok: true });
  });

  it("does not run the cost check at all when no dollar cap is set", async () => {
    const sumCostDaily = vi.fn(async () => ({ sum: 0, count: 0 }));
    const svc = build({
      project: project({ dailyRuns: 5 }),
      ledger: { countDaily: async () => 0, sumCostDaily },
    });
    expect(await svc.check("alpha")).toEqual({ ok: true });
    expect(sumCostDaily).not.toHaveBeenCalled();
  });

  it("holds (over global) when the cost ledger is unreadable (fail-closed)", async () => {
    const svc = build({
      project: project({ dailyCostCapUsd: 10 }),
      ledger: {
        sumCostDaily: async () => {
          throw new Error("EACCES");
        },
      },
    });
    const result = await svc.check("alpha");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.over).toBe("global");
  });
});

describe("BudgetService.status — monthly", () => {
  it("includes a month-to-date window with its cap", async () => {
    const svc = build({
      project: project({ monthlyRuns: 30 }),
      ledger: { countMonthly: async () => 7 },
    });
    const status = await svc.status();
    expect(status.projects[0]?.monthly).toEqual({ used: 7, cap: 30 });
  });
});

describe("BudgetService.status — cost windows (Phase 12)", () => {
  it("reports spentUsd + capUsd for a project with a dollar cap set", async () => {
    const svc = build({
      project: project({ dailyCostCapUsd: 10 }),
      ledger: { sumCostDaily: async () => ({ sum: 3.5, count: 2 }) },
    });
    const status = await svc.status();
    expect(status.projects[0]?.dailyCost).toEqual({ spentUsd: 3.5, capUsd: 10 });
  });

  it("still reports spentUsd with no capUsd when the project has no dollar cap", async () => {
    const svc = build({
      project: project({ dailyRuns: 5 }),
      ledger: { sumCostDaily: async () => ({ sum: 1.2, count: 1 }) },
    });
    const status = await svc.status();
    expect(status.projects[0]?.dailyCost).toEqual({ spentUsd: 1.2 });
  });
});

describe("BudgetService.recordCost", () => {
  it("appends a cost line via the ledger", async () => {
    const recordCost = vi.fn(async () => {});
    const svc = build({ ledger: { recordCost } });
    await svc.recordCost({
      projectId: "alpha",
      taskId: "t1",
      runRef: "r1",
      kind: "agent",
      costUsd: 0.4,
    });
    expect(recordCost).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "alpha", runRef: "r1", costUsd: 0.4 }),
      expect.any(Date),
    );
  });

  it("swallows a ledger write failure — best-effort, never throws", async () => {
    const svc = build({
      ledger: {
        recordCost: async () => {
          throw new Error("disk full");
        },
      },
    });
    await expect(
      svc.recordCost({ projectId: "alpha", runRef: "r1", kind: "agent", costUsd: 1 }),
    ).resolves.toBeUndefined();
  });
});

describe("BudgetService.countRunning", () => {
  const agent = (over: Partial<AgentRun>): AgentRun => ({
    runId: "a1",
    agentId: "x",
    status: "running",
    pct: 0,
    title: "",
    prompt: "",
    project: "alpha",
    files: [],
    cwd: "/t",
    startedAt: new Date().toISOString(),
    pid: 1,
    logFile: "/t.log",
    ...over,
  });
  const pipeline = (over: Partial<PipelineRun>): PipelineRun => ({
    pipelineRunId: "p1",
    pipelineId: "rel",
    status: "running",
    currentStage: null,
    stageRuns: [],
    startedAt: new Date().toISOString(),
    cwd: "/p",
    projectPath: "/work/alpha",
    ...over,
  });

  it("counts running agent runs + running pipeline runs for the project", async () => {
    const svc = build({
      project: project({ maxConcurrent: 2 }),
      agentRuns: [agent({ runId: "a1" }), agent({ runId: "a2", status: "done" })],
      pipelineRuns: [pipeline({ pipelineRunId: "p1" })],
    });
    expect(await svc.countRunning("alpha")).toBe(2); // a1 (running) + p1; a2 done excluded
  });

  it("excludes runs labelled with a different project", async () => {
    const svc = build({
      project: project({ maxConcurrent: 2 }),
      agentRuns: [agent({ project: "beta" })],
      pipelineRuns: [pipeline({ projectPath: "/work/beta" })],
    });
    expect(await svc.countRunning("alpha")).toBe(0);
  });

  it("counts an awaiting-approval agent run as occupying a slot", async () => {
    const svc = build({
      project: project({ maxConcurrent: 1 }),
      agentRuns: [agent({ status: "awaiting-approval" })],
    });
    expect(await svc.countRunning("alpha")).toBe(1);
  });

  it("counts a paused-limit run as still occupying a slot", async () => {
    const svc = build({
      project: project({ maxConcurrent: 1 }),
      agentRuns: [agent({ status: "paused-limit" })],
    });
    expect(await svc.countRunning("alpha")).toBe(1);
  });
});

describe("BudgetService.countRunningGlobal (125c)", () => {
  const agent = (over: Partial<AgentRun>): AgentRun => ({
    runId: "a1",
    agentId: "x",
    status: "running",
    pct: 0,
    title: "",
    prompt: "",
    project: "alpha",
    files: [],
    cwd: "/t",
    startedAt: new Date().toISOString(),
    pid: 1,
    logFile: "/t.log",
    ...over,
  });
  const pipeline = (over: Partial<PipelineRun>): PipelineRun => ({
    pipelineRunId: "p1",
    pipelineId: "rel",
    status: "running",
    currentStage: null,
    stageRuns: [],
    startedAt: new Date().toISOString(),
    cwd: "/p",
    projectPath: "/work/alpha",
    ...over,
  });

  it("counts across every project — no label filter, unlike countRunning", async () => {
    const svc = build({
      agentRuns: [
        agent({ runId: "a1", project: "alpha" }),
        agent({ runId: "a2", project: "beta" }),
      ],
      pipelineRuns: [pipeline({ pipelineRunId: "p1", projectPath: "/work/gamma" })],
    });
    expect(await svc.countRunningGlobal()).toBe(3);
  });

  it("counts an unattributed run (empty project label) same as any other", async () => {
    const svc = build({
      agentRuns: [agent({ project: "" })],
    });
    expect(await svc.countRunningGlobal()).toBe(1);
  });

  it("counts paused-limit agent and pipeline runs — a paused run still owns its slot", async () => {
    const svc = build({
      agentRuns: [agent({ status: "paused-limit" })],
      pipelineRuns: [pipeline({ status: "paused-limit" })],
    });
    expect(await svc.countRunningGlobal()).toBe(2);
  });

  it("counts an awaiting-approval agent run", async () => {
    const svc = build({ agentRuns: [agent({ status: "awaiting-approval" })] });
    expect(await svc.countRunningGlobal()).toBe(1);
  });

  it("ignores terminal agent statuses (done/error/interrupted)", async () => {
    const svc = build({
      agentRuns: [
        agent({ runId: "a1", status: "done" }),
        agent({ runId: "a2", status: "error" }),
        agent({ runId: "a3", status: "interrupted" }),
      ],
    });
    expect(await svc.countRunningGlobal()).toBe(0);
  });

  it("ignores a terminal (failed) pipeline run", async () => {
    const svc = build({ pipelineRuns: [pipeline({ status: "failed" })] });
    expect(await svc.countRunningGlobal()).toBe(0);
  });

  it("zero running anywhere is zero", async () => {
    const svc = build();
    expect(await svc.countRunningGlobal()).toBe(0);
  });
});
