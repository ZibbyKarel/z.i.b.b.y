import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentRun, Project, WorkflowRun } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunRecorderService } from "./run-recorder.service";
import { VaultService } from "./vault.service";

/** A scriptable runner double that captures the recorder's status listener. */
function makeRunner<T>() {
  let listener: ((run: T) => void) | null = null;
  return {
    listener: () => listener,
    onRunStatus: (l: (run: T) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
    emit: (run: T) => listener?.(run),
  };
}

describe("RunRecorderService", () => {
  let vaultDir: string;
  let runCwd: string;
  let vault: VaultService;

  beforeEach(async () => {
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "rec-vault-"));
    runCwd = await fs.mkdtemp(path.join(os.tmpdir(), "rec-run-"));
    vault = new VaultService(vaultDir);
    await vault.onModuleInit();
  });

  afterEach(async () => {
    await fs.rm(vaultDir, { recursive: true, force: true });
    await fs.rm(runCwd, { recursive: true, force: true });
  });

  /** Read today's daily note body (the single file the recorder appends to). */
  async function readDaily(): Promise<string> {
    const dailyDir = path.join(vaultDir, "daily");
    const files = await fs.readdir(dailyDir).catch(() => []);
    if (files.length === 0) return "";
    return fs.readFile(path.join(dailyDir, files[0] as string), "utf8");
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
    }) as AgentRun;

  const workflowRun = (over: Partial<WorkflowRun> = {}): WorkflowRun =>
    ({
      workflowRunId: "delivery_123",
      workflowId: "delivery",
      status: "done",
      currentStage: null,
      stageRuns: [{ phaseId: "a", runId: "r", attempt: 0, status: "done" }],
      startedAt: "2026-06-12T00:00:00.000Z",
      cwd: runCwd,
      ...over,
    }) as WorkflowRun;

  const noProjects = {
    get: vi.fn(async () => {
      throw new Error("nope");
    }),
    list: vi.fn(async () => []),
  };

  /** Default agent/workflow storage doubles: no entity found → no owner (unowned run). */
  const noAgentsStore = {
    get: vi.fn(async () => {
      throw new Error("no such agent");
    }),
  };
  const noWorkflowsStore = {
    get: vi.fn(async () => {
      throw new Error("no such workflow");
    }),
  };

  function build(opts: {
    agent: ReturnType<typeof makeRunner<AgentRun>>;
    workflow: ReturnType<typeof makeRunner<WorkflowRun>>;
    projects?: { get: (id: string) => Promise<Project>; list: () => Promise<Project[]> };
    readArtifact?: (id: string, name: string) => Promise<{ name: string; content: string } | null>;
    agentList?: () => AgentRun[];
    workflowList?: () => WorkflowRun[];
    agentsStore?: { get: (id: string) => Promise<{ department?: string }> };
    workflowsStore?: { get: (id: string) => Promise<{ department?: string }> };
  }): RunRecorderService {
    const agentRunner = { ...opts.agent, listRunning: opts.agentList ?? (() => []) };
    const workflowRunner = {
      ...opts.workflow,
      list: opts.workflowList ?? (() => []),
      readArtifact: opts.readArtifact ?? (async () => null),
    };
    return new RunRecorderService(
      vault,
      agentRunner as never,
      workflowRunner as never,
      (opts.projects ?? noProjects) as never,
      (opts.agentsStore ?? noAgentsStore) as never,
      (opts.workflowsStore ?? noWorkflowsStore) as never,
    );
  }

  it("records one daily line for a terminal agent run", async () => {
    const agent = makeRunner<AgentRun>();
    const workflow = makeRunner<WorkflowRun>();
    const svc = build({ agent, workflow });
    svc.onModuleInit();
    agent.emit(agentRun());
    await vi.waitFor(async () => expect(await readDaily()).toContain("coder_123"));
    const daily = await readDaily();
    expect(daily).toMatch(/run coder_123 \(coder\) fix bug → done/);
  });

  it("never double-records the same run (marker)", async () => {
    const agent = makeRunner<AgentRun>();
    const workflow = makeRunner<WorkflowRun>();
    const svc = build({ agent, workflow });
    svc.onModuleInit();
    agent.emit(agentRun());
    await vi.waitFor(async () => expect(await readDaily()).toContain("coder_123"));
    agent.emit(agentRun());
    // Give the second emission a chance to (not) write.
    await new Promise((r) => setTimeout(r, 30));
    const count = (await readDaily()).match(/coder_123/g)?.length ?? 0;
    expect(count).toBe(1);
  });

  it("ignores non-terminal statuses", async () => {
    const agent = makeRunner<AgentRun>();
    const workflow = makeRunner<WorkflowRun>();
    const svc = build({ agent, workflow });
    svc.onModuleInit();
    agent.emit(agentRun({ status: "running" }));
    workflow.emit(workflowRun({ status: "parked" }));
    await new Promise((r) => setTimeout(r, 30));
    expect(await readDaily()).toBe("");
  });

  it("bootstrap sweep records a pre-existing terminal run", async () => {
    const agent = makeRunner<AgentRun>();
    const workflow = makeRunner<WorkflowRun>();
    const svc = build({ agent, workflow, agentList: () => [agentRun({ runId: "swept_9" })] });
    await svc.onApplicationBootstrap();
    expect(await readDaily()).toContain("swept_9");
  });

  it("records a successful workflow with a daily line carrying the project link but NO learned backlink", async () => {
    const project: Project = { id: "acme", name: "ACME", path: "/repos/acme" };
    const agent = makeRunner<AgentRun>();
    const workflow = makeRunner<WorkflowRun>();
    const readArtifact = vi.fn(async () => ({ name: "learned.md", content: "x" }));
    const svc = build({
      agent,
      workflow,
      projects: {
        get: async () => {
          throw new Error();
        },
        list: async () => [project],
      },
      readArtifact,
    });
    svc.onModuleInit();
    workflow.emit(workflowRun({ projectPath: "/repos/acme" }));
    await vi.waitFor(async () => expect(await readDaily()).toContain("delivery_123"));

    const daily = await readDaily();
    expect(daily).toMatch(/workflow delivery_123 \(delivery\) → done/);
    expect(daily).toContain("[[acme]]");
    // fileLearned was retired (binding decision 5) — no learned.md read, no backlink, no note.
    expect(readArtifact).not.toHaveBeenCalled();
    expect(daily).not.toContain("[[learned-delivery_123]]");
    await expect(vault.note("learned-delivery_123")).rejects.toThrow();
  });

  it("records a failed workflow as a daily line only (no learned note)", async () => {
    const agent = makeRunner<AgentRun>();
    const workflow = makeRunner<WorkflowRun>();
    const readArtifact = vi.fn(async () => ({ name: "learned.md", content: "x" }));
    const svc = build({ agent, workflow, readArtifact });
    svc.onModuleInit();
    workflow.emit(workflowRun({ status: "failed" }));
    await vi.waitFor(async () => expect(await readDaily()).toContain("delivery_123"));
    expect(await readDaily()).toMatch(/workflow delivery_123 \(delivery\) → failed/);
    // A failed run never reaches the learned-note path.
    expect(readArtifact).not.toHaveBeenCalled();
    await expect(vault.note("learned-delivery_123")).rejects.toThrow();
  });

  it("F4a: an owned agent run's daily line links its department's shelf", async () => {
    const agent = makeRunner<AgentRun>();
    const workflow = makeRunner<WorkflowRun>();
    const svc = build({
      agent,
      workflow,
      agentsStore: { get: async () => ({ department: "dev" }) },
    });
    svc.onModuleInit();
    agent.emit(agentRun());
    await vi.waitFor(async () => expect(await readDaily()).toContain("coder_123"));
    const daily = await readDaily();
    expect(daily).toContain("[[department-dev-moc|dev]]");
  });

  it("F4a: an unowned agent run's daily line is unchanged (today's exact line)", async () => {
    const agent = makeRunner<AgentRun>();
    const workflow = makeRunner<WorkflowRun>();
    const svc = build({
      agent,
      workflow,
      agentsStore: { get: async () => ({}) },
    });
    svc.onModuleInit();
    agent.emit(agentRun());
    await vi.waitFor(async () => expect(await readDaily()).toContain("coder_123"));
    const daily = await readDaily();
    expect(daily).toMatch(/run coder_123 \(coder\) fix bug → done/);
    expect(daily).not.toContain("department-");
  });

  it("F4a: a storage lookup failure still writes the daily line (fail-open)", async () => {
    const agent = makeRunner<AgentRun>();
    const workflow = makeRunner<WorkflowRun>();
    const svc = build({ agent, workflow }); // default agentsStore throws on get()
    svc.onModuleInit();
    agent.emit(agentRun());
    await vi.waitFor(async () => expect(await readDaily()).toContain("coder_123"));
    const daily = await readDaily();
    expect(daily).toMatch(/run coder_123 \(coder\) fix bug → done/);
    expect(daily).not.toContain("department-");
  });

  it("F4a: an owned workflow run's daily line links its department's shelf", async () => {
    const agent = makeRunner<AgentRun>();
    const workflow = makeRunner<WorkflowRun>();
    const svc = build({
      agent,
      workflow,
      workflowsStore: { get: async () => ({ department: "rnd" }) },
    });
    svc.onModuleInit();
    workflow.emit(workflowRun());
    await vi.waitFor(async () => expect(await readDaily()).toContain("delivery_123"));
    const daily = await readDaily();
    expect(daily).toContain("[[department-rnd-moc|rnd]]");
  });
});
