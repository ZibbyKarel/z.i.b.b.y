import type {
  Agent,
  Approval,
  Employee,
  Integration,
  Mandate,
  Pipeline,
  TaskRun,
} from "@zibby/contracts";
import { DEFAULT_MANDATE, DEPARTMENTS } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import type { AgentsStorageService } from "../agents/agents.storage.service";
import type { ApprovalsService } from "../approvals/approvals.service";
import type { EmployeesStorageService } from "../employees/employees.storage.service";
import type { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import type { MandateStorageService } from "../mandate/mandate.storage.service";
import type { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import type { SubtaskSummary } from "@zibby/contracts";
import type { TaskParentsService } from "../tasks/task-parents.service";
import type { TaskRunsService } from "../tasks/task-runs.service";
import { DEPARTMENT_SEEN_EPOCH, type DepartmentSeenStore } from "./department-seen.store";
import { DepartmentNotFoundError } from "./departments.errors";
import { DepartmentsService } from "./departments.service";

const AT = "2026-07-08T00:00:00.000Z";
const LATER = "2026-07-08T01:00:00.000Z";

function pipelineFixture(id: string, department?: Pipeline["department"]): Pipeline {
  return {
    id,
    phases: [{ id: "p0", type: "verify" }],
    outputs: [],
    instructions: "do the thing",
    // NS2 F9 — schema-defaulted, so non-optional on a parsed entity.
    complexity: "standard",
    ...(department ? { department } : {}),
  } as Pipeline;
}

function taskRunFixture(
  over: Partial<TaskRun> & Pick<TaskRun, "runId" | "kind" | "owner" | "status">,
): TaskRun {
  return {
    pct: null,
    title: "",
    prompt: "",
    project: "",
    startedAt: AT,
    logBase: null,
    ...over,
  };
}

function approvalFixture(
  over: Partial<Approval> & Pick<Approval, "id" | "runId" | "kind">,
): Approval {
  return {
    skill: "koder",
    action: "git.push",
    detail: "",
    risk: "medium",
    status: "pending",
    requestedAt: AT,
    ...over,
  };
}

/** Builds a `DepartmentsService` over hand-rolled fakes of its five injected domain services + the seen store. */
function build(opts: {
  pipelines?: Pipeline[];
  runs?: TaskRun[];
  pendingApprovals?: Approval[];
  seenAt?: Record<string, string>;
  agents?: Agent[];
  integrations?: Integration[];
  mandate?: Mandate;
  /** D-015: `roster()`'s agent membership — active employees, not `Agent.department`. */
  employees?: Employee[];
  /** ZB-04a §5: `subtasks()`'s backing read model. */
  departmentSubtasks?: SubtaskSummary[];
}) {
  const pipelinesStore = { list: vi.fn(async () => opts.pipelines ?? []) };
  const taskRuns = { listTaskRuns: vi.fn(async () => opts.runs ?? []) };
  const approvals = { list: vi.fn(async () => opts.pendingApprovals ?? []) };
  const agentsStore = { list: vi.fn(async () => opts.agents ?? []) };
  const integrationsStore = { list: vi.fn(async () => opts.integrations ?? []) };
  const mandateStore = { read: vi.fn(async () => opts.mandate ?? DEFAULT_MANDATE) };
  const employeesStore = { list: vi.fn(async () => opts.employees ?? []) };
  const taskParents = {
    getDepartmentSubtasks: vi.fn(async () => opts.departmentSubtasks ?? []),
  };
  const seenMap = new Map<string, string>(Object.entries(opts.seenAt ?? {}));
  const seenStore = {
    seenAt: vi.fn(async (id: string) => seenMap.get(id) ?? DEPARTMENT_SEEN_EPOCH),
    markSeen: vi.fn(async (id: string) => {
      const now = new Date().toISOString();
      seenMap.set(id, now);
      return now;
    }),
  };

  const service = new DepartmentsService(
    pipelinesStore as unknown as PipelinesStorageService,
    taskRuns as unknown as TaskRunsService,
    approvals as unknown as ApprovalsService,
    seenStore as unknown as DepartmentSeenStore,
    agentsStore as unknown as AgentsStorageService,
    integrationsStore as unknown as IntegrationsStorageService,
    mandateStore as unknown as MandateStorageService,
    employeesStore as unknown as EmployeesStorageService,
    taskParents as unknown as TaskParentsService,
  );
  return {
    service,
    pipelinesStore,
    taskRuns,
    approvals,
    seenStore,
    agentsStore,
    integrationsStore,
    mandateStore,
    employeesStore,
    taskParents,
  };
}

describe("DepartmentsService", () => {
  describe("get() — attribution", () => {
    it("a running run on an owned pipeline reads as running", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "running",
          }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ state: "running", tier2Count: 0, tier3Count: 0 });
    });

    it("a pending pipeline-output approval attributes to the owning department as waiting", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "awaiting-approval",
          }),
        ],
        pendingApprovals: [
          approvalFixture({ id: "appr-1", runId: "delivery_1", kind: "pipeline-output" }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ state: "waiting", tier3Count: 1 });
    });

    it("a pending pipeline-stage approval (stage-run-id prefix) attributes the same way", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "awaiting-approval",
          }),
        ],
        pendingApprovals: [
          approvalFixture({
            id: "appr-1",
            runId: "delivery_1.04_koder_p9",
            kind: "pipeline-stage",
          }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ state: "waiting", tier3Count: 1 });
    });

    it("precedence: waiting wins even while another owned run is running", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev"), pipelineFixture("release", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "running",
          }),
          taskRunFixture({
            runId: "release_1",
            kind: "pipeline",
            owner: "release",
            status: "awaiting-approval",
          }),
        ],
        pendingApprovals: [
          approvalFixture({ id: "appr-1", runId: "release_1", kind: "pipeline-output" }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev.state).toBe("waiting");
      expect(dev.tier3Count).toBe(1);
    });

    it("a completed owned run after lastSeenAt reads as report with a count", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "done",
            startedAt: LATER,
          }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ state: "report", tier2Count: 1 });
    });

    it("an errored owned run after lastSeenAt reads as error with its own count, not report", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "error",
            startedAt: LATER,
          }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ state: "error", tier2Count: 0, errorCount: 1 });
    });

    it("lists the run ids behind errorCount, and an empty list when there are none", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "error",
            startedAt: LATER,
          }),
          taskRunFixture({
            runId: "delivery_2",
            kind: "pipeline",
            owner: "delivery",
            status: "done",
            startedAt: LATER,
          }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ errorCount: 1, errorRunIds: ["delivery_1"] });
      const research = await service.get("rnd");
      expect(research.errorRunIds).toEqual([]);
    });

    it("a done AND an errored owned run after lastSeenAt both count, error wins the headline state", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev"), pipelineFixture("release", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "done",
            startedAt: LATER,
          }),
          taskRunFixture({
            runId: "release_1",
            kind: "pipeline",
            owner: "release",
            status: "error",
            startedAt: LATER,
          }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ state: "error", tier2Count: 1, errorCount: 1 });
    });

    it("precedence: error outranks a still-running owned run", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev"), pipelineFixture("release", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "running",
          }),
          taskRunFixture({
            runId: "release_1",
            kind: "pipeline",
            owner: "release",
            status: "error",
            startedAt: LATER,
          }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev.state).toBe("error");
    });

    it("precedence: waiting still outranks error", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev"), pipelineFixture("release", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "awaiting-approval",
          }),
          taskRunFixture({
            runId: "release_1",
            kind: "pipeline",
            owner: "release",
            status: "error",
            startedAt: LATER,
          }),
        ],
        pendingApprovals: [
          approvalFixture({ id: "appr-1", runId: "delivery_1", kind: "pipeline-output" }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev.state).toBe("waiting");
    });

    it("a completed run BEFORE lastSeenAt does not count", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "done",
            startedAt: AT,
          }),
        ],
        seenAt: { dev: LATER },
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ state: "idle", tier2Count: 0 });
    });

    it("with no owned activity a department reads as idle with zero counts", async () => {
      const { service } = build({});
      const ops = await service.get("ops");
      expect(ops).toMatchObject({ state: "idle", tier2Count: 0, tier3Count: 0 });
    });

    it("throws DepartmentNotFoundError for an id outside the registry", async () => {
      const { service } = build({});
      await expect(service.get("nope")).rejects.toThrow(DepartmentNotFoundError);
    });
  });

  describe("unattributable exclusion", () => {
    it("an approval whose kind carries no pipeline (e.g. channel/task) is excluded without error", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        pendingApprovals: [
          approvalFixture({ id: "appr-1", runId: "integration_1/item_2", kind: "channel" }),
          approvalFixture({ id: "appr-2", runId: "task_9", kind: "task" }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ state: "idle", tier3Count: 0 });
    });

    it("a run on an unowned pipeline never surfaces for any department", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("orphan")],
        runs: [
          taskRunFixture({
            runId: "orphan_1",
            kind: "pipeline",
            owner: "orphan",
            status: "running",
          }),
        ],
      });
      const rows = await service.list();
      expect(rows.every((r) => r.state === "idle")).toBe(true);
    });

    it("an agent-kind run whose agent has no department never attributes", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        agents: [{ id: "koder", instructions: "x" } as Agent],
        runs: [
          taskRunFixture({ runId: "koder_1", kind: "agent", owner: "koder", status: "running" }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev.state).toBe("idle");
    });

    it("a goal-kind run never attributes (D16 — goal runs are deliberately unattributed)", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        agents: [{ id: "koder", department: "dev", instructions: "x" } as Agent],
        runs: [
          taskRunFixture({ runId: "goal_1", kind: "goal", owner: "koder", status: "running" }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev.state).toBe("idle");
    });
  });

  describe("agent-run attribution", () => {
    it("a running agent-kind run whose agent has department: dev puts dev in a running state", async () => {
      const { service } = build({
        agents: [{ id: "koder", department: "dev", instructions: "x" } as Agent],
        runs: [
          taskRunFixture({ runId: "koder_1", kind: "agent", owner: "koder", status: "running" }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ state: "running", tier2Count: 0, tier3Count: 0 });
    });

    it("a completed owned agent run after lastSeenAt reads as report with a count", async () => {
      const { service } = build({
        agents: [{ id: "koder", department: "dev", instructions: "x" } as Agent],
        runs: [
          taskRunFixture({
            runId: "koder_1",
            kind: "agent",
            owner: "koder",
            status: "done",
            startedAt: LATER,
          }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ state: "report", tier2Count: 1 });
    });

    it("agent and pipeline runs owned by the same department both count", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        agents: [{ id: "koder", department: "dev", instructions: "x" } as Agent],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "done",
            startedAt: LATER,
          }),
          taskRunFixture({
            runId: "koder_1",
            kind: "agent",
            owner: "koder",
            status: "done",
            startedAt: LATER,
          }),
        ],
      });
      const dev = await service.get("dev");
      expect(dev).toMatchObject({ state: "report", tier2Count: 2 });
    });
  });

  describe("markSeen", () => {
    it("resets tier2Count to 0 and the state falls back to idle once seen", async () => {
      const { service, seenStore } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "done",
            startedAt: LATER,
          }),
        ],
      });
      expect((await service.get("dev")).tier2Count).toBe(1);

      const refreshed = await service.markSeen("dev");
      expect(seenStore.markSeen).toHaveBeenCalledWith("dev");
      expect(refreshed).toMatchObject({ state: "idle", tier2Count: 0 });
    });

    it("falls back to running (not idle) when a run is still active after being seen", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "done",
            startedAt: LATER,
          }),
          taskRunFixture({
            runId: "delivery_2",
            kind: "pipeline",
            owner: "delivery",
            status: "running",
          }),
        ],
      });
      const refreshed = await service.markSeen("dev");
      expect(refreshed).toMatchObject({ state: "running", tier2Count: 0 });
    });

    it("throws DepartmentNotFoundError for an unknown id", async () => {
      const { service } = build({});
      await expect(service.markSeen("nope")).rejects.toThrow(DepartmentNotFoundError);
    });
  });

  describe("list() — severity ordering", () => {
    it("sorts waiting first, then report, then running, then idle; registry order is the stable tiebreak", async () => {
      const { service } = build({
        pipelines: [
          pipelineFixture("p-incident", "inc"),
          pipelineFixture("p-research", "rnd"),
          pipelineFixture("p-dev", "dev"),
        ],
        runs: [
          // dev: running → running
          taskRunFixture({
            runId: "p-dev_1",
            kind: "pipeline",
            owner: "p-dev",
            status: "running",
          }),
          // research: completed after lastSeenAt → report
          taskRunFixture({
            runId: "p-research_1",
            kind: "pipeline",
            owner: "p-research",
            status: "done",
            startedAt: LATER,
          }),
          // incident: awaiting-approval, attributed below → waiting
          taskRunFixture({
            runId: "p-incident_1",
            kind: "pipeline",
            owner: "p-incident",
            status: "awaiting-approval",
          }),
        ],
        pendingApprovals: [
          approvalFixture({ id: "appr-1", runId: "p-incident_1", kind: "pipeline-output" }),
        ],
      });
      const rows = await service.list();
      const ids = rows.map((r) => r.id);
      const waitingIndex = ids.indexOf("inc");
      const reportIndex = ids.indexOf("rnd");
      const runningIndex = ids.indexOf("dev");
      const idleIndexes = ids
        .map((id, i) => [id, i] as const)
        .filter(([id]) => !["inc", "rnd", "dev"].includes(id))
        .map(([, i]) => i);

      expect(waitingIndex).toBeLessThan(reportIndex);
      expect(reportIndex).toBeLessThan(runningIndex);
      expect(Math.max(runningIndex)).toBeLessThan(Math.min(...idleIndexes));

      // registry-order tiebreak among the untouched `idle` entries.
      const idleIds = idleIndexes.map((i) => ids[i]);
      const registryIdleOrder = DEPARTMENTS.map((s) => s.id).filter(
        (id) => !["inc", "rnd", "dev"].includes(id),
      );
      expect(idleIds).toEqual(registryIdleOrder);
    });

    it("within waiting, higher tier3Count sorts first", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("p-incident", "inc"), pipelineFixture("p-security", "sec")],
        runs: [
          taskRunFixture({
            runId: "p-incident_1",
            kind: "pipeline",
            owner: "p-incident",
            status: "awaiting-approval",
          }),
          taskRunFixture({
            runId: "p-security_1",
            kind: "pipeline",
            owner: "p-security",
            status: "awaiting-approval",
          }),
          taskRunFixture({
            runId: "p-security_2",
            kind: "pipeline",
            owner: "p-security",
            status: "awaiting-approval",
          }),
        ],
        pendingApprovals: [
          approvalFixture({ id: "appr-1", runId: "p-incident_1", kind: "pipeline-output" }),
          approvalFixture({ id: "appr-2", runId: "p-security_1", kind: "pipeline-output" }),
          approvalFixture({ id: "appr-3", runId: "p-security_2", kind: "pipeline-output" }),
        ],
      });
      const rows = await service.list();
      const ids = rows.filter((r) => r.state === "waiting").map((r) => r.id);
      expect(ids).toEqual(["sec", "inc"]);
    });

    it("all-idle registry stays in registry order (list() still returns all 11)", async () => {
      const { service } = build({});
      const rows = await service.list();
      expect(rows).toHaveLength(11);
      expect(rows.map((r) => r.id)).toEqual(DEPARTMENTS.map((s) => s.id));
      expect(rows.every((r) => r.state === "idle")).toBe(true);
    });
  });

  describe("listUnowned() — NS2 F1b", () => {
    it("returns [] when every pipeline/agent is owned (integrations are never reported)", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "dev")],
        agents: [{ id: "architect", department: "dev", instructions: "x" } as Agent],
        // An integration with no owner tag is NOT an ownership gap — membership is
        // derived, so it never appears in the unowned report.
        integrations: [
          {
            id: "team-slack",
            kind: "slack",
            projectId: "acme",
            config: { kind: "slack", channels: [] },
            enabled: true,
            status: "disconnected",
            hasCredentials: false,
          } as Integration,
        ],
      });
      expect(await service.listUnowned()).toEqual([]);
    });

    it("lists every unowned pipeline/agent by kind + id (never an integration)", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("orphan-pipeline")],
        agents: [{ id: "orphan-agent", instructions: "x" } as Agent],
        integrations: [
          {
            id: "orphan-integration",
            kind: "slack",
            projectId: "acme",
            config: { kind: "slack", channels: [] },
            enabled: true,
            status: "disconnected",
            hasCredentials: false,
          } as Integration,
        ],
      });
      const unowned = await service.listUnowned();
      expect(unowned).toEqual(
        expect.arrayContaining([
          { kind: "pipeline", id: "orphan-pipeline" },
          { kind: "agent", id: "orphan-agent" },
        ]),
      );
      expect(unowned).toHaveLength(2);
    });
  });

  describe("roster()", () => {
    function agentFixture(id: string, department?: Agent["department"]): Agent {
      return {
        id,
        name: id,
        instructions: "x",
        ...(department ? { department } : {}),
      } as Agent;
    }

    /**
     * D-015: `roster()` reads membership off active employees, not `Agent.department`
     * — an employee "for" the agent fixtures above, in the same department.
     */
    function employeeFixture(agentId: string, department: Employee["department"]): Employee {
      return {
        id: `employee_${agentId}`,
        name: agentId,
        agentId,
        department,
        status: "active",
        hiredAt: AT,
      };
    }

    function slackFixture(id: string): Integration {
      return {
        id,
        name: id,
        kind: "slack",
        projectId: "acme",
        config: { kind: "slack", channels: [] },
        enabled: true,
        status: "disconnected",
        hasCredentials: false,
      } as Integration;
    }

    function githubFixture(id: string, streams: string[]): Integration {
      return {
        id,
        name: id,
        kind: "github",
        projectId: "acme",
        config: { kind: "github", repo: "zibby/zibby", streams },
        enabled: true,
        status: "disconnected",
        hasCredentials: false,
      } as Integration;
    }

    it("agents are filtered by department; a non-ops/comms department sees no integrations", async () => {
      const { service } = build({
        agents: [agentFixture("architekt", "dev"), agentFixture("scribe", "knw")],
        employees: [employeeFixture("architekt", "dev"), employeeFixture("scribe", "knw")],
        integrations: [slackFixture("team-slack"), slackFixture("watch")],
      });
      const dev = await service.roster("dev");
      expect(dev.agents).toEqual([{ id: "architekt", name: "architekt" }]);
      expect(dev.integrations).toEqual([]);
      expect(dev.monitors).toEqual([]);
    });

    it("ops sees EVERY integration (the heartbeat watcher listens to all)", async () => {
      const { service } = build({
        integrations: [slackFixture("team-slack"), slackFixture("watch")],
      });
      const ops = await service.roster("ops");
      expect(ops.integrations).toEqual([
        { id: "team-slack", name: "team-slack", kind: "slack" },
        { id: "watch", name: "watch", kind: "slack" },
      ]);
    });

    it("comms sees only the reply-enabled integrations (mandate.reply)", async () => {
      const mandate: Mandate = {
        defaults: { dispatch: true, reply: false },
        channels: { "team-slack": { reply: true } },
      };
      const { service } = build({
        integrations: [slackFixture("team-slack"), slackFixture("silent")],
        mandate,
      });
      const comms = await service.roster("com");
      expect(comms.integrations).toEqual([{ id: "team-slack", name: "team-slack", kind: "slack" }]);
    });

    it("comms falls back to the default reply flag when a channel has no override", async () => {
      const mandate: Mandate = { defaults: { dispatch: true, reply: true }, channels: {} };
      const { service } = build({ integrations: [slackFixture("team-slack")], mandate });
      const comms = await service.roster("com");
      expect(comms.integrations).toHaveLength(1);
    });

    it("is empty for a department that owns nothing (knowledge/finance)", async () => {
      const { service } = build({
        agents: [agentFixture("architekt", "dev")],
        employees: [employeeFixture("architekt", "dev")],
        integrations: [slackFixture("team-slack")],
      });
      const knowledge = await service.roster("knw");
      expect(knowledge).toEqual({ agents: [], integrations: [], monitors: [] });
      const finance = await service.roster("fin");
      expect(finance).toEqual({ agents: [], integrations: [], monitors: [] });
    });

    it("monitors is the subset of the department's integrations that are a GitHub integration with a ci stream", async () => {
      const { service } = build({
        integrations: [
          githubFixture("ci-repo", ["issues", "pulls", "ci"]),
          githubFixture("no-ci-repo", ["issues", "pulls"]),
          slackFixture("team-slack"),
        ],
      });
      const ops = await service.roster("ops");
      expect(ops.integrations).toHaveLength(3);
      expect(ops.monitors).toEqual([{ id: "ci-repo", name: "ci-repo", kind: "github" }]);
    });

    it("throws DepartmentNotFoundError for an id outside the registry", async () => {
      const { service } = build({});
      await expect(service.roster("nope")).rejects.toThrow(DepartmentNotFoundError);
    });
  });

  describe("subtasks() — ZB-04a §5", () => {
    it("delegates to the task-parents read model with the resolved department id", async () => {
      const subtask: SubtaskSummary = { taskId: "task_1", state: "working" };
      const { service, taskParents } = build({ departmentSubtasks: [subtask] });
      await expect(service.subtasks("dev")).resolves.toEqual([subtask]);
      expect(taskParents.getDepartmentSubtasks).toHaveBeenCalledWith("dev");
    });

    it("throws DepartmentNotFoundError for an id outside the registry", async () => {
      const { service } = build({});
      await expect(service.subtasks("nope")).rejects.toThrow(DepartmentNotFoundError);
    });
  });
});
