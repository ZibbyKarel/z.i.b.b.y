import type {
  Agent,
  AgentRun,
  Chain,
  ChainRun,
  Goal,
  GoalRun,
  Pipeline,
  PipelineRun,
  Project,
  ScheduledTask,
} from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import type { AgentRunnerService } from "../agents/agent-runner.service";
import type { AgentsStorageService } from "../agents/agents.storage.service";
import type { ChainRunnerService } from "../chains/chain-runner.service";
import type { ChainsStorageService } from "../chains/chains.storage.service";
import type { GoalRunnerService } from "../goals/goal-runner.service";
import { GoalRunNotStoppableError } from "../goals/goals.errors";
import type { GoalsStorageService } from "../goals/goals.storage.service";
import { PipelineRunNotStoppableError } from "../pipelines/pipeline-runner.service";
import type { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import type { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import type { ProjectsStorageService } from "../projects/projects.storage.service";
import type { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";
import {
  TaskRunNotResumableError,
  TaskRunNotStoppableError,
  TaskRunsService,
} from "./task-runs.service";

const AT = "2026-06-16T00:00:00.000Z";

const acmeProject = { id: "acme", name: "Acme Corp", path: "/repos/acme" } as Project;

const agentA: AgentRun = {
  runId: "researcher_1",
  agentId: "researcher",
  status: "running",
  taskId: "task1",
  pct: 42,
  title: "",
  prompt: "dig into X",
  project: "acme",
  files: [],
  cwd: "/tmp/acme",
  startedAt: AT,
  pid: 100,
  logFile: "/tmp/researcher_1.log",
};

// A goal's maker child run — same store as standalone agent runs, but folded out of the feed.
const makerChild: AgentRun = {
  ...agentA,
  runId: "koder_2",
  agentId: "koder",
  taskId: undefined,
  startedAt: "2026-06-16T00:01:00.000Z",
};

const pipeP: PipelineRun = {
  pipelineRunId: "delivery_3",
  pipelineId: "delivery",
  status: "running",
  taskId: undefined,
  currentStage: "kodér",
  stageRuns: [],
  startedAt: "2026-06-16T00:02:00.000Z",
  // `cwd` is the run's own per-phase sandbox root (named `${pipelineId}_${startedMs}`,
  // mirroring production) — never the display project. `projectPath` is the resolved
  // target project's path, which the display label must be derived from instead.
  cwd: "/tmp/delivery_3",
  projectPath: acmeProject.path,
};

const goalG: GoalRun = {
  goalRunId: "ship-it_4",
  goalId: "ship-it",
  status: "running",
  currentIteration: 0,
  iterations: [
    {
      index: 0,
      makerKind: "agent",
      makerRunRef: "koder_2",
      verifier: { kind: "checks", satisfied: false, output: "" },
      startedAt: "2026-06-16T00:01:00.000Z",
      status: "running",
    },
  ],
  startedAt: "2026-06-16T00:03:00.000Z",
  cwd: "/tmp/acme",
};

const chainC: ChainRun = {
  chainRunId: "research-then-build_5",
  chainId: "research-then-build",
  status: "running",
  currentStep: 0,
  steps: [
    { index: 0, pipeline: "research", runRef: "research_1", status: "running" },
    { index: 1, pipeline: "delivery", status: "pending" },
  ],
  startedAt: "2026-06-16T00:04:00.000Z",
  taskId: "task-chain",
};

const scheduledS: ScheduledTask = {
  id: "task9",
  title: "later",
  text: "do it later",
  paths: [],
  toolGrants: [],
  attachments: [],
  scheduledAt: Date.parse("2026-06-17T00:00:00.000Z"),
  status: "scheduled",
  createdAt: AT,
  target: { kind: "agent", id: "researcher", name: "Researcher" },
};

const agentDef = { id: "researcher", name: "Researcher" } as Agent;
const pipelineDef = { id: "delivery", name: "Delivery Pipeline" } as Pipeline;
const chainDef = { id: "research-then-build", name: "Research then Build" } as Chain;
// goal definition intentionally absent → processor.name must fall back to the id

function build() {
  const agentRunner = {
    listAll: vi.fn(async () => [agentA, makerChild]),
    get: vi.fn((id: string) => {
      const run = [agentA, makerChild].find((r) => r.runId === id);
      if (!run) throw new Error("not found");
      return run;
    }),
    readLog: vi.fn(async () => ({ content: "log", nextOffset: 3, done: false })),
    stop: vi.fn((id: string) => ({ ...agentA, runId: id, status: "interrupted" })),
    delete: vi.fn(async () => {}),
  };
  const pipelineRunner = {
    listAll: vi.fn(async () => [pipeP]),
    get: vi.fn((id: string) => {
      if (id !== pipeP.pipelineRunId) throw new Error("not found");
      return pipeP;
    }),
    readStageLog: vi.fn(async () => ({ content: "stage", nextOffset: 5, done: false })),
    onStageLogAppend: vi.fn(() => () => {}),
    readArtifact: vi.fn(async () => ({ name: "pr-draft.md", content: "PR" })),
    stop: vi.fn(async () => {}),
    resumeParked: vi.fn(async () => pipeP),
    delete: vi.fn(async () => {}),
  };
  const goalRunner = {
    listAll: vi.fn(async () => [goalG]),
    get: vi.fn((id: string) => {
      if (id !== goalG.goalRunId) throw new Error("not found");
      return goalG;
    }),
    readArtifact: vi.fn(async () => ({ name: "verdict.txt", content: "ok" })),
    stop: vi.fn(async () => {}),
    resumeParked: vi.fn(async () => goalG),
    delete: vi.fn(async () => {}),
  };
  const chainRunner = {
    listAll: vi.fn(async () => [] as ChainRun[]),
    get: vi.fn((id: string) => {
      if (id !== chainC.chainRunId) throw new Error("not found");
      return chainC;
    }),
  };
  const agentsStore = { list: vi.fn(async () => [agentDef]) };
  const pipelinesStore = { list: vi.fn(async () => [pipelineDef]) };
  const goalsStore = { list: vi.fn(async () => [] as Goal[]) };
  const chainsStore = { list: vi.fn(async () => [chainDef]) };
  const projectsStore = { list: vi.fn(async () => [acmeProject]) };
  const scheduled = { list: vi.fn(async () => [scheduledS]) };

  const service = new TaskRunsService(
    agentRunner as unknown as AgentRunnerService,
    pipelineRunner as unknown as PipelineRunnerService,
    goalRunner as unknown as GoalRunnerService,
    chainRunner as unknown as ChainRunnerService,
    agentsStore as unknown as AgentsStorageService,
    pipelinesStore as unknown as PipelinesStorageService,
    goalsStore as unknown as GoalsStorageService,
    chainsStore as unknown as ChainsStorageService,
    projectsStore as unknown as ProjectsStorageService,
    scheduled as unknown as ScheduledTasksStorageService,
  );
  return {
    service,
    agentRunner,
    pipelineRunner,
    goalRunner,
    chainRunner,
    pipelinesStore,
    projectsStore,
    scheduled,
  };
}

describe("TaskRunsService", () => {
  describe("listTaskRuns — goal child folding", () => {
    it("folds a goal's maker child run out of the feed", async () => {
      const { service } = build();
      const feed = await service.listTaskRuns();
      const ids = feed.map((r) => r.runId);
      expect(ids).toContain("researcher_1");
      expect(ids).toContain("delivery_3");
      expect(ids).toContain("ship-it_4");
      expect(ids).toContain("task9");
      // The maker child must NOT appear as a peer row (Phase-26 one-card-per-task).
      expect(ids).not.toContain("koder_2");
    });

    it("keeps the folded child reachable by id (goal detail fetches it)", async () => {
      const { service } = build();
      const child = await service.getTaskRun("koder_2");
      expect(child.kind).toBe("agent");
      expect(child.runId).toBe("koder_2");
    });

    it("sorts newest-first", async () => {
      const { service } = build();
      const feed = await service.listTaskRuns();
      // task9 (scheduled tomorrow) sorts to the top by startedAt.
      expect(feed[0]?.runId).toBe("task9");
    });
  });

  describe("pipelineRunToView — outputArtifactName (P2-T1)", () => {
    it("appears when outputsOverride contains a file output, carrying its `from`", async () => {
      const { service, pipelineRunner } = build();
      pipelineRunner.listAll.mockResolvedValue([
        {
          ...pipeP,
          outputsOverride: [
            { type: "file", from: "custom-report.md", dest: "project", to: "docs/report.md" },
          ],
        },
      ]);
      const run = await service.getTaskRun(pipeP.pipelineRunId);
      expect(run.outputArtifactName).toBe("custom-report.md");
    });

    it("is absent when outputsOverride has no file output", async () => {
      const { service, pipelineRunner } = build();
      pipelineRunner.listAll.mockResolvedValue([
        { ...pipeP, outputsOverride: [{ type: "pr", from: "pr-draft.md" }] },
      ]);
      const run = await service.getTaskRun(pipeP.pipelineRunId);
      expect(run.outputArtifactName).toBeUndefined();
    });

    it("is absent when outputsOverride is undefined and the pipeline definition has no file output", async () => {
      const { service } = build();
      const run = await service.getTaskRun(pipeP.pipelineRunId);
      expect(run.outputArtifactName).toBeUndefined();
    });

    it("falls back to the pipeline definition's own `outputs:` when the run has no outputsOverride", async () => {
      const { service, pipelinesStore } = build();
      pipelinesStore.list.mockResolvedValue([
        {
          ...pipelineDef,
          outputs: [{ type: "file", from: "audit-report.md", dest: "vault", to: "report" }],
        },
      ]);
      const run = await service.getTaskRun(pipeP.pipelineRunId);
      expect(run.outputArtifactName).toBe("audit-report.md");
    });
  });

  describe("chain runs in the feed (Phase 05)", () => {
    it("surfaces a chain run as a first-class feed row with kind chain", async () => {
      const { service, chainRunner } = build();
      chainRunner.listAll.mockResolvedValue([chainC]);
      const feed = await service.listTaskRuns();
      const row = feed.find((r) => r.runId === chainC.chainRunId);
      expect(row?.kind).toBe("chain");
      expect(row?.chainId).toBe("research-then-build");
      expect(row?.steps).toHaveLength(2);
      expect(row?.processor).toEqual({
        kind: "chain",
        id: "research-then-build",
        name: "Research then Build",
      });
    });

    it("kindOf resolves a chain runId via getTaskRun", async () => {
      const { service, chainRunner } = build();
      chainRunner.listAll.mockResolvedValue([chainC]);
      const row = await service.getTaskRun(chainC.chainRunId);
      expect(row.kind).toBe("chain");
    });
  });

  describe("costUsd projection (Phase 03)", () => {
    it("sums the stage costs of a pipeline run", async () => {
      const { service, pipelineRunner } = build();
      pipelineRunner.listAll.mockResolvedValue([
        {
          ...pipeP,
          stageRuns: [
            { phaseId: "a", runId: "a_1", attempt: 1, status: "done", costUsd: 0.1 },
            { phaseId: "b", runId: "b_1", attempt: 1, status: "done", costUsd: 0.25 },
          ],
        },
      ]);
      const run = await service.getTaskRun(pipeP.pipelineRunId);
      expect(run.costUsd).toBeCloseTo(0.35, 10);
    });

    it("sums only stages that carry a cost (no NaN from a costless stage)", async () => {
      const { service, pipelineRunner } = build();
      pipelineRunner.listAll.mockResolvedValue([
        {
          ...pipeP,
          stageRuns: [
            { phaseId: "a", runId: "a_1", attempt: 1, status: "done", costUsd: 0.2 },
            { phaseId: "b", runId: "b_1", attempt: 1, status: "done" },
          ],
        },
      ]);
      const run = await service.getTaskRun(pipeP.pipelineRunId);
      expect(run.costUsd).toBeCloseTo(0.2, 10);
    });

    it("is absent when no stage carries a cost (old run — not $0.00)", async () => {
      const { service, pipelineRunner } = build();
      pipelineRunner.listAll.mockResolvedValue([
        {
          ...pipeP,
          stageRuns: [{ phaseId: "a", runId: "a_1", attempt: 1, status: "done" }],
        },
      ]);
      const run = await service.getTaskRun(pipeP.pipelineRunId);
      expect(run.costUsd).toBeUndefined();
    });

    it("carries an agent run's own costUsd through", async () => {
      const { service, agentRunner } = build();
      agentRunner.listAll.mockResolvedValue([{ ...agentA, costUsd: 0.5 }, makerChild]);
      const run = await service.getTaskRun(agentA.runId);
      expect(run.costUsd).toBeCloseTo(0.5, 10);
    });
  });

  describe("processor resolution", () => {
    it("resolves the human name from the definition store", async () => {
      const { service } = build();
      const feed = await service.listTaskRuns();
      const agent = feed.find((r) => r.runId === "researcher_1");
      const pipeline = feed.find((r) => r.runId === "delivery_3");
      expect(agent?.processor).toEqual({ kind: "agent", id: "researcher", name: "Researcher" });
      expect(pipeline?.processor).toEqual({
        kind: "pipeline",
        id: "delivery",
        name: "Delivery Pipeline",
      });
    });

    it("falls back to the id when the definition is gone", async () => {
      const { service } = build();
      const feed = await service.listTaskRuns();
      const goal = feed.find((r) => r.runId === "ship-it_4");
      // goal definition absent → name === id
      expect(goal?.processor).toEqual({ kind: "goal", id: "ship-it", name: "ship-it" });
    });

    it("carries the processor on a scheduled task from its chosen target", async () => {
      const { service } = build();
      const feed = await service.listTaskRuns();
      const task = feed.find((r) => r.runId === "task9");
      expect(task?.kind).toBe("scheduled");
      expect(task?.processor).toEqual({ kind: "agent", id: "researcher", name: "Researcher" });
    });
  });

  describe("projectId join from the owning task (project filter / summary)", () => {
    it("attaches the owning task's projectId onto its agent run in the feed", async () => {
      const { service, scheduled } = build();
      // The dispatched task that spawned researcher_1 (taskId "task1") carries the
      // engagement id; a dispatched task is folded out of the feed itself but still
      // enriches its run. This is what makes the project-scoped deep-link (`/archiv?
      // project=`, F8d — was `/runs?project=`) and the project summary attributable
      // across all run kinds.
      scheduled.list.mockResolvedValue([
        { ...scheduledS, id: "task1", status: "dispatched", projectId: "acme" },
      ]);
      const feed = await service.listTaskRuns();
      expect(feed.find((r) => r.runId === "researcher_1")?.projectId).toBe("acme");
    });

    it("leaves projectId unset when the owning task has none (falls outside every project filter)", async () => {
      const { service, scheduled } = build();
      scheduled.list.mockResolvedValue([{ ...scheduledS, id: "task1", status: "dispatched" }]);
      const feed = await service.listTaskRuns();
      expect(feed.find((r) => r.runId === "researcher_1")?.projectId).toBeUndefined();
    });
  });

  describe("classification enrichment (F2c)", () => {
    it("joins the owning task's classification trace onto its run", async () => {
      const { service, scheduled } = build();
      scheduled.list.mockResolvedValue([
        {
          ...scheduledS,
          id: "task1",
          status: "dispatched",
          classification: {
            stage1: { kind: "subsystem", id: "forge", name: "Forge" },
            confidence: 0.8,
            reason: "matches forge's mandate",
            matchedTerms: ["ship"],
            subsystem: "forge",
          },
        },
      ]);
      const feed = await service.listTaskRuns();
      const run = feed.find((r) => r.runId === "researcher_1");
      expect(run?.classification?.subsystem).toBe("forge");
      expect(run?.classification?.stage1).toEqual({
        kind: "subsystem",
        id: "forge",
        name: "Forge",
      });
    });

    it("leaves classification unset when the owning task carries none", async () => {
      const { service, scheduled } = build();
      scheduled.list.mockResolvedValue([{ ...scheduledS, id: "task1", status: "dispatched" }]);
      const feed = await service.listTaskRuns();
      expect(feed.find((r) => r.runId === "researcher_1")?.classification).toBeUndefined();
    });
  });

  describe("project display label (regression: was showing the run's own sandbox id)", () => {
    it("resolves a pipeline run's project from its resolved projectPath, not its sandbox cwd", async () => {
      const { service } = build();
      const run = await service.getTaskRun(pipeP.pipelineRunId);
      // `cwd` is "/tmp/delivery_3" (the sandbox root, named after the run itself) —
      // the display label must never equal that; it resolves via `projectPath` instead.
      expect(run.project).toBe("Acme Corp");
      expect(run.project).not.toBe("delivery_3");
    });

    it("falls back to the resolved path's basename when the project isn't registered", async () => {
      const { service, projectsStore } = build();
      projectsStore.list.mockResolvedValue([]);
      const run = await service.getTaskRun(pipeP.pipelineRunId);
      expect(run.project).toBe("acme");
    });

    it("shows no project for a pipeline/goal run with no resolved projectPath", async () => {
      const { service } = build();
      const run = await service.getTaskRun(goalG.goalRunId);
      expect(run.project).toBe("");
    });

    it("resolves an agent run's raw project reference (an id) to its registered name", async () => {
      const { service, agentRunner } = build();
      agentRunner.listAll.mockResolvedValue([{ ...agentA, project: "acme" }, makerChild]);
      const run = await service.getTaskRun(agentA.runId);
      expect(run.project).toBe("Acme Corp");
    });

    it("the owning task's projectId wins over the kind-specific project label when both resolve", async () => {
      const { service, scheduled, pipelineRunner } = build();
      // A pipeline run resolved to a *different*, unregistered filesystem path than
      // the task's own engagement — the path-based fallback would read "other", but
      // the task's projectId is the authoritative display source and must win.
      pipelineRunner.listAll.mockResolvedValue([
        { ...pipeP, taskId: "task-pipe", projectPath: "/repos/other" },
      ]);
      scheduled.list.mockResolvedValue([
        { ...scheduledS, id: "task-pipe", status: "dispatched", projectId: "acme" },
      ]);
      const run = await service.getTaskRun(pipeP.pipelineRunId);
      expect(run.project).toBe("Acme Corp");
    });
  });

  describe("taskOutcomeFinishedAt (total run duration)", () => {
    it("joins the task's written-back outcome finish time onto its run", async () => {
      const { service, scheduled } = build();
      scheduled.list.mockResolvedValue([
        {
          ...scheduledS,
          id: "task1",
          status: "dispatched",
          outcome: { status: "done", summary: "ok", finishedAt: "2026-06-16T00:05:00.000Z" },
        },
      ]);
      const feed = await service.listTaskRuns();
      expect(feed.find((r) => r.runId === "researcher_1")?.taskOutcomeFinishedAt).toBe(
        "2026-06-16T00:05:00.000Z",
      );
    });

    it("is absent when the owning task has no written-back outcome yet", async () => {
      const { service, scheduled } = build();
      scheduled.list.mockResolvedValue([{ ...scheduledS, id: "task1", status: "dispatched" }]);
      const run = await service.getTaskRun(agentA.runId);
      expect(run.taskOutcomeFinishedAt).toBeUndefined();
    });
  });

  describe("resolveOwner — lifecycle dispatch by kind", () => {
    it("routes logs to the agent runner", async () => {
      const { service, agentRunner } = build();
      await service.getLogs("researcher_1", 0);
      expect(agentRunner.readLog).toHaveBeenCalledWith("researcher_1", 0);
    });

    it("routes stage logs to the pipeline runner", async () => {
      const { service, pipelineRunner } = build();
      await service.getStageLog("delivery_3", "kodér", 0);
      expect(pipelineRunner.readStageLog).toHaveBeenCalledWith("delivery_3", "kodér", 0);
    });

    it("routes stage-log append subscriptions to the pipeline runner (SSE tail wake signal)", () => {
      const { service, pipelineRunner } = build();
      const listener = () => {};
      const unsub = () => {};
      pipelineRunner.onStageLogAppend.mockReturnValue(unsub);
      expect(service.onStageLogAppend("delivery_3", "kodér", listener)).toBe(unsub);
      expect(pipelineRunner.onStageLogAppend).toHaveBeenCalledWith("delivery_3", "kodér", listener);
    });

    it("routes artifacts to the goal runner for a goal run", async () => {
      const { service, goalRunner } = build();
      const artifact = await service.getArtifact("ship-it_4", "verdict.txt");
      expect(goalRunner.readArtifact).toHaveBeenCalledWith("ship-it_4", "verdict.txt");
      expect(artifact).toEqual({ name: "verdict.txt", content: "ok" });
    });

    it("stops an agent, pipeline, or goal run via its own runner; refuses a chain run", async () => {
      const { service, agentRunner, pipelineRunner, goalRunner } = build();
      await service.stop("researcher_1");
      expect(agentRunner.stop).toHaveBeenCalledWith("researcher_1");
      await service.stop("delivery_3");
      expect(pipelineRunner.stop).toHaveBeenCalledWith("delivery_3");
      await service.stop("ship-it_4");
      expect(goalRunner.stop).toHaveBeenCalledWith("ship-it_4");
      // A chain run owns no single live process of its own — no stop.
      await expect(service.stop("research-then-build_5")).rejects.toBeInstanceOf(
        TaskRunNotStoppableError,
      );
    });

    it("normalizes a pipeline/goal runner's own 'not stoppable' error to the unified one", async () => {
      const { service, pipelineRunner, goalRunner } = build();
      pipelineRunner.stop.mockRejectedValueOnce(new PipelineRunNotStoppableError("delivery_3"));
      await expect(service.stop("delivery_3")).rejects.toBeInstanceOf(TaskRunNotStoppableError);
      goalRunner.stop.mockRejectedValueOnce(new GoalRunNotStoppableError("ship-it_4"));
      await expect(service.stop("ship-it_4")).rejects.toBeInstanceOf(TaskRunNotStoppableError);
    });

    it("resumes pipeline/goal runs, refuses to resume an agent run", async () => {
      const { service, pipelineRunner, goalRunner } = build();
      await service.resume("delivery_3", "go");
      expect(pipelineRunner.resumeParked).toHaveBeenCalledWith("delivery_3", "go");
      await service.resume("ship-it_4", "again");
      expect(goalRunner.resumeParked).toHaveBeenCalledWith("ship-it_4", "again");
      await expect(service.resume("researcher_1")).rejects.toBeInstanceOf(TaskRunNotResumableError);
    });

    it("deletes via the owning runner", async () => {
      const { service, pipelineRunner } = build();
      await service.delete("delivery_3");
      expect(pipelineRunner.delete).toHaveBeenCalledWith("delivery_3");
    });
  });
});
