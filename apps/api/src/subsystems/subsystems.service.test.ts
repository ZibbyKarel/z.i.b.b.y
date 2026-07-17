import type { Agent, Approval, Chain, Integration, Pipeline, TaskRun } from "@zibby/contracts";
import { SUBSYSTEMS } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import type { AgentsStorageService } from "../agents/agents.storage.service";
import type { ApprovalsService } from "../approvals/approvals.service";
import type { ChainsStorageService } from "../chains/chains.storage.service";
import type { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import type { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import type { TaskRunsService } from "../tasks/task-runs.service";
import { SUBSYSTEM_SEEN_EPOCH, type SubsystemSeenStore } from "./subsystem-seen.store";
import { SubsystemNotFoundError } from "./subsystems.errors";
import { SubsystemsService } from "./subsystems.service";

const AT = "2026-07-08T00:00:00.000Z";
const LATER = "2026-07-08T01:00:00.000Z";

function pipelineFixture(id: string, ownerSubsystem?: Pipeline["ownerSubsystem"]): Pipeline {
  return {
    id,
    phases: [{ id: "p0", type: "verify" }],
    outputs: [],
    instructions: "do the thing",
    ...(ownerSubsystem ? { ownerSubsystem } : {}),
  } as Pipeline;
}

function chainFixture(id: string, ownerSubsystem?: Chain["ownerSubsystem"]): Chain {
  return {
    id,
    steps: [{ pipeline: "delivery" }],
    ...(ownerSubsystem ? { ownerSubsystem } : {}),
  } as Chain;
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

/** Builds a `SubsystemsService` over hand-rolled fakes of its six injected domain services + the seen store. */
function build(opts: {
  pipelines?: Pipeline[];
  chains?: Chain[];
  runs?: TaskRun[];
  pendingApprovals?: Approval[];
  seenAt?: Record<string, string>;
  agents?: Agent[];
  integrations?: Integration[];
}) {
  const pipelinesStore = { list: vi.fn(async () => opts.pipelines ?? []) };
  const chainsStore = { list: vi.fn(async () => opts.chains ?? []) };
  const taskRuns = { listTaskRuns: vi.fn(async () => opts.runs ?? []) };
  const approvals = { list: vi.fn(async () => opts.pendingApprovals ?? []) };
  const agentsStore = { list: vi.fn(async () => opts.agents ?? []) };
  const integrationsStore = { list: vi.fn(async () => opts.integrations ?? []) };
  const seenMap = new Map<string, string>(Object.entries(opts.seenAt ?? {}));
  const seenStore = {
    seenAt: vi.fn(async (id: string) => seenMap.get(id) ?? SUBSYSTEM_SEEN_EPOCH),
    markSeen: vi.fn(async (id: string) => {
      const now = new Date().toISOString();
      seenMap.set(id, now);
      return now;
    }),
  };

  const service = new SubsystemsService(
    pipelinesStore as unknown as PipelinesStorageService,
    chainsStore as unknown as ChainsStorageService,
    taskRuns as unknown as TaskRunsService,
    approvals as unknown as ApprovalsService,
    seenStore as unknown as SubsystemSeenStore,
    agentsStore as unknown as AgentsStorageService,
    integrationsStore as unknown as IntegrationsStorageService,
  );
  return {
    service,
    pipelinesStore,
    chainsStore,
    taskRuns,
    approvals,
    seenStore,
    agentsStore,
    integrationsStore,
  };
}

describe("SubsystemsService", () => {
  describe("get() — attribution", () => {
    it("a running run on an owned pipeline reads as running", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "running",
          }),
        ],
      });
      const forge = await service.get("forge");
      expect(forge).toMatchObject({ state: "running", tier2Count: 0, tier3Count: 0 });
    });

    it("a running run on an owned chain also reads as running", async () => {
      const { service } = build({
        chains: [chainFixture("research-then-build", "scout")],
        runs: [
          taskRunFixture({
            runId: "research-then-build_1",
            kind: "chain",
            owner: "research-then-build",
            status: "running",
          }),
        ],
      });
      const scout = await service.get("scout");
      expect(scout.state).toBe("running");
    });

    it("a pending pipeline-output approval attributes to the owning subsystem as waiting", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
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
      const forge = await service.get("forge");
      expect(forge).toMatchObject({ state: "waiting", tier3Count: 1 });
    });

    it("a pending pipeline-stage approval (stage-run-id prefix) attributes the same way", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
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
      const forge = await service.get("forge");
      expect(forge).toMatchObject({ state: "waiting", tier3Count: 1 });
    });

    it("precedence: waiting wins even while another owned run is running", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge"), pipelineFixture("release", "forge")],
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
      const forge = await service.get("forge");
      expect(forge.state).toBe("waiting");
      expect(forge.tier3Count).toBe(1);
    });

    it("a completed owned run after lastSeenAt reads as report with a count", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
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
      const forge = await service.get("forge");
      expect(forge).toMatchObject({ state: "report", tier2Count: 1 });
    });

    it("an errored owned run after lastSeenAt also counts toward report", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
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
      const forge = await service.get("forge");
      expect(forge).toMatchObject({ state: "report", tier2Count: 1 });
    });

    it("a completed run BEFORE lastSeenAt does not count", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
        runs: [
          taskRunFixture({
            runId: "delivery_1",
            kind: "pipeline",
            owner: "delivery",
            status: "done",
            startedAt: AT,
          }),
        ],
        seenAt: { forge: LATER },
      });
      const forge = await service.get("forge");
      expect(forge).toMatchObject({ state: "idle", tier2Count: 0 });
    });

    it("with no owned activity a subsystem reads as idle with zero counts", async () => {
      const { service } = build({});
      const puls = await service.get("puls");
      expect(puls).toMatchObject({ state: "idle", tier2Count: 0, tier3Count: 0 });
    });

    it("throws SubsystemNotFoundError for an id outside the registry", async () => {
      const { service } = build({});
      await expect(service.get("nope")).rejects.toThrow(SubsystemNotFoundError);
    });
  });

  describe("unattributable exclusion", () => {
    it("an approval whose kind carries no pipeline (e.g. channel/task) is excluded without error", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
        pendingApprovals: [
          approvalFixture({ id: "appr-1", runId: "integration_1/item_2", kind: "channel" }),
          approvalFixture({ id: "appr-2", runId: "task_9", kind: "task" }),
        ],
      });
      const forge = await service.get("forge");
      expect(forge).toMatchObject({ state: "idle", tier3Count: 0 });
    });

    it("a run on an unowned pipeline never surfaces for any subsystem", async () => {
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

    it("an agent-kind run never attributes (only pipeline/chain owners exist)", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
        runs: [
          taskRunFixture({ runId: "koder_1", kind: "agent", owner: "koder", status: "running" }),
        ],
      });
      const forge = await service.get("forge");
      expect(forge.state).toBe("idle");
    });
  });

  describe("markSeen", () => {
    it("resets tier2Count to 0 and the state falls back to idle once seen", async () => {
      const { service, seenStore } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
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
      expect((await service.get("forge")).tier2Count).toBe(1);

      const refreshed = await service.markSeen("forge");
      expect(seenStore.markSeen).toHaveBeenCalledWith("forge");
      expect(refreshed).toMatchObject({ state: "idle", tier2Count: 0 });
    });

    it("falls back to running (not idle) when a run is still active after being seen", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
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
      const refreshed = await service.markSeen("forge");
      expect(refreshed).toMatchObject({ state: "running", tier2Count: 0 });
    });

    it("throws SubsystemNotFoundError for an unknown id", async () => {
      const { service } = build({});
      await expect(service.markSeen("nope")).rejects.toThrow(SubsystemNotFoundError);
    });
  });

  describe("list() — severity ordering", () => {
    it("sorts waiting first, then report, then running, then idle; registry order is the stable tiebreak", async () => {
      const { service } = build({
        pipelines: [
          pipelineFixture("p-beacon", "beacon"),
          pipelineFixture("p-scout", "scout"),
          pipelineFixture("p-forge", "forge"),
        ],
        runs: [
          // forge: running → running
          taskRunFixture({
            runId: "p-forge_1",
            kind: "pipeline",
            owner: "p-forge",
            status: "running",
          }),
          // scout: completed after lastSeenAt → report
          taskRunFixture({
            runId: "p-scout_1",
            kind: "pipeline",
            owner: "p-scout",
            status: "done",
            startedAt: LATER,
          }),
          // beacon: awaiting-approval, attributed below → waiting
          taskRunFixture({
            runId: "p-beacon_1",
            kind: "pipeline",
            owner: "p-beacon",
            status: "awaiting-approval",
          }),
        ],
        pendingApprovals: [
          approvalFixture({ id: "appr-1", runId: "p-beacon_1", kind: "pipeline-output" }),
        ],
      });
      const rows = await service.list();
      const ids = rows.map((r) => r.id);
      const waitingIndex = ids.indexOf("beacon");
      const reportIndex = ids.indexOf("scout");
      const runningIndex = ids.indexOf("forge");
      const idleIndexes = ids
        .map((id, i) => [id, i] as const)
        .filter(([id]) => !["beacon", "scout", "forge"].includes(id))
        .map(([, i]) => i);

      expect(waitingIndex).toBeLessThan(reportIndex);
      expect(reportIndex).toBeLessThan(runningIndex);
      expect(Math.max(runningIndex)).toBeLessThan(Math.min(...idleIndexes));

      // registry-order tiebreak among the untouched `idle` entries.
      const idleIds = idleIndexes.map((i) => ids[i]);
      const registryIdleOrder = SUBSYSTEMS.map((s) => s.id).filter(
        (id) => !["beacon", "scout", "forge"].includes(id),
      );
      expect(idleIds).toEqual(registryIdleOrder);
    });

    it("within waiting, higher tier3Count sorts first", async () => {
      const { service } = build({
        pipelines: [
          pipelineFixture("p-beacon", "beacon"),
          pipelineFixture("p-sentinel", "sentinel"),
        ],
        runs: [
          taskRunFixture({
            runId: "p-beacon_1",
            kind: "pipeline",
            owner: "p-beacon",
            status: "awaiting-approval",
          }),
          taskRunFixture({
            runId: "p-sentinel_1",
            kind: "pipeline",
            owner: "p-sentinel",
            status: "awaiting-approval",
          }),
          taskRunFixture({
            runId: "p-sentinel_2",
            kind: "pipeline",
            owner: "p-sentinel",
            status: "awaiting-approval",
          }),
        ],
        pendingApprovals: [
          approvalFixture({ id: "appr-1", runId: "p-beacon_1", kind: "pipeline-output" }),
          approvalFixture({ id: "appr-2", runId: "p-sentinel_1", kind: "pipeline-output" }),
          approvalFixture({ id: "appr-3", runId: "p-sentinel_2", kind: "pipeline-output" }),
        ],
      });
      const rows = await service.list();
      const ids = rows.filter((r) => r.state === "waiting").map((r) => r.id);
      expect(ids).toEqual(["sentinel", "beacon"]);
    });

    it("all-idle registry stays in registry order (list() still returns all 10)", async () => {
      const { service } = build({});
      const rows = await service.list();
      expect(rows).toHaveLength(10);
      expect(rows.map((r) => r.id)).toEqual(SUBSYSTEMS.map((s) => s.id));
      expect(rows.every((r) => r.state === "idle")).toBe(true);
    });
  });

  describe("listUnowned() — NS2 F1b", () => {
    it("returns [] when every pipeline/chain/agent/integration is owned", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
        chains: [chainFixture("audit-develop", "scout")],
        agents: [{ id: "architect", ownerSubsystem: "forge", instructions: "x" } as Agent],
        integrations: [
          {
            id: "team-slack",
            kind: "slack",
            projectId: "acme",
            config: { kind: "slack", channels: [] },
            enabled: true,
            status: "disconnected",
            hasCredentials: false,
            ownerSubsystem: "puls",
          } as Integration,
        ],
      });
      expect(await service.listUnowned()).toEqual([]);
    });

    it("lists every unowned pipeline/chain/agent/integration by kind + id", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("orphan-pipeline")],
        chains: [chainFixture("orphan-chain")],
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
          { kind: "chain", id: "orphan-chain" },
          { kind: "agent", id: "orphan-agent" },
          { kind: "integration", id: "orphan-integration" },
        ]),
      );
      expect(unowned).toHaveLength(4);
    });
  });

  describe("roster() — NS2 F1c", () => {
    function agentFixture(id: string, ownerSubsystem?: Agent["ownerSubsystem"]): Agent {
      return {
        id,
        name: id,
        instructions: "x",
        ...(ownerSubsystem ? { ownerSubsystem } : {}),
      } as Agent;
    }

    function slackFixture(id: string, ownerSubsystem?: Integration["ownerSubsystem"]): Integration {
      return {
        id,
        name: id,
        kind: "slack",
        projectId: "acme",
        config: { kind: "slack", channels: [] },
        enabled: true,
        status: "disconnected",
        hasCredentials: false,
        ...(ownerSubsystem ? { ownerSubsystem } : {}),
      } as Integration;
    }

    function githubFixture(
      id: string,
      streams: string[],
      ownerSubsystem?: Integration["ownerSubsystem"],
    ): Integration {
      return {
        id,
        name: id,
        kind: "github",
        projectId: "acme",
        config: { kind: "github", repo: "zibby/zibby", streams },
        enabled: true,
        status: "disconnected",
        hasCredentials: false,
        ...(ownerSubsystem ? { ownerSubsystem } : {}),
      } as Integration;
    }

    it("exact match: only entities owned by the given subsystem are returned", async () => {
      const { service } = build({
        agents: [agentFixture("architekt", "forge"), agentFixture("scribe", "codex")],
        integrations: [slackFixture("team-slack", "forge"), slackFixture("watch", "puls")],
      });
      const forge = await service.roster("forge");
      expect(forge.agents).toEqual([{ id: "architekt", name: "architekt" }]);
      expect(forge.integrations).toEqual([{ id: "team-slack", name: "team-slack", kind: "slack" }]);
    });

    it("is empty for a subsystem that owns nothing (codex/ledger)", async () => {
      const { service } = build({
        agents: [agentFixture("architekt", "forge")],
        integrations: [slackFixture("team-slack", "forge")],
      });
      const codex = await service.roster("codex");
      expect(codex).toEqual({ agents: [], integrations: [], monitors: [] });
      const ledger = await service.roster("ledger");
      expect(ledger).toEqual({ agents: [], integrations: [], monitors: [] });
    });

    it("counts match fixture: multiple owned agents/integrations all come back", async () => {
      const { service } = build({
        agents: [agentFixture("architekt", "forge"), agentFixture("koder", "forge")],
        integrations: [
          slackFixture("team-slack", "forge"),
          githubFixture("repo-watch", ["issues", "pulls"], "forge"),
        ],
      });
      const forge = await service.roster("forge");
      expect(forge.agents).toHaveLength(2);
      expect(forge.integrations).toHaveLength(2);
    });

    it("monitors is the subset of owned integrations that are a GitHub integration with a ci stream", async () => {
      const { service } = build({
        integrations: [
          githubFixture("ci-repo", ["issues", "pulls", "ci"], "forge"),
          githubFixture("no-ci-repo", ["issues", "pulls"], "forge"),
          slackFixture("team-slack", "forge"),
        ],
      });
      const forge = await service.roster("forge");
      expect(forge.integrations).toHaveLength(3);
      expect(forge.monitors).toEqual([{ id: "ci-repo", name: "ci-repo", kind: "github" }]);
    });

    it("throws SubsystemNotFoundError for an id outside the registry", async () => {
      const { service } = build({});
      await expect(service.roster("nope")).rejects.toThrow(SubsystemNotFoundError);
    });
  });
});
