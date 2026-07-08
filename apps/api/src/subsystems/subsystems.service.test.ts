import type { Approval, Chain, Pipeline, TaskRun } from "@zibby/contracts";
import { SUBSYSTEMS } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import type { ApprovalsService } from "../approvals/approvals.service";
import type { ChainsStorageService } from "../chains/chains.storage.service";
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

function taskRunFixture(over: Partial<TaskRun> & Pick<TaskRun, "runId" | "kind" | "owner" | "status">): TaskRun {
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

function approvalFixture(over: Partial<Approval> & Pick<Approval, "id" | "runId" | "kind">): Approval {
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

/** Builds a `SubsystemsService` over hand-rolled fakes of its four injected domain services + the seen store. */
function build(opts: {
  pipelines?: Pipeline[];
  chains?: Chain[];
  runs?: TaskRun[];
  pendingApprovals?: Approval[];
  seenAt?: Record<string, string>;
}) {
  const pipelinesStore = { list: vi.fn(async () => opts.pipelines ?? []) };
  const chainsStore = { list: vi.fn(async () => opts.chains ?? []) };
  const taskRuns = { listTaskRuns: vi.fn(async () => opts.runs ?? []) };
  const approvals = { list: vi.fn(async () => opts.pendingApprovals ?? []) };
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
  );
  return { service, pipelinesStore, chainsStore, taskRuns, approvals, seenStore };
}

describe("SubsystemsService", () => {
  describe("get() — attribution", () => {
    it("a running run on an owned pipeline reads as bezi", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
        runs: [taskRunFixture({ runId: "delivery_1", kind: "pipeline", owner: "delivery", status: "running" })],
      });
      const forge = await service.get("forge");
      expect(forge).toMatchObject({ state: "bezi", tier2Count: 0, tier3Count: 0 });
    });

    it("a running run on an owned chain also reads as bezi", async () => {
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
      expect(scout.state).toBe("bezi");
    });

    it("a pending pipeline-output approval attributes to the owning subsystem as ceka", async () => {
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
        pendingApprovals: [approvalFixture({ id: "appr-1", runId: "delivery_1", kind: "pipeline-output" })],
      });
      const forge = await service.get("forge");
      expect(forge).toMatchObject({ state: "ceka", tier3Count: 1 });
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
          approvalFixture({ id: "appr-1", runId: "delivery_1.04_koder_p9", kind: "pipeline-stage" }),
        ],
      });
      const forge = await service.get("forge");
      expect(forge).toMatchObject({ state: "ceka", tier3Count: 1 });
    });

    it("precedence: ceka wins even while another owned run is running (bezi)", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge"), pipelineFixture("release", "forge")],
        runs: [
          taskRunFixture({ runId: "delivery_1", kind: "pipeline", owner: "delivery", status: "running" }),
          taskRunFixture({
            runId: "release_1",
            kind: "pipeline",
            owner: "release",
            status: "awaiting-approval",
          }),
        ],
        pendingApprovals: [approvalFixture({ id: "appr-1", runId: "release_1", kind: "pipeline-output" })],
      });
      const forge = await service.get("forge");
      expect(forge.state).toBe("ceka");
      expect(forge.tier3Count).toBe(1);
    });

    it("a completed owned run after lastSeenAt reads as hlaseni with a count", async () => {
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
      expect(forge).toMatchObject({ state: "hlaseni", tier2Count: 1 });
    });

    it("an errored owned run after lastSeenAt also counts toward hlaseni", async () => {
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
      expect(forge).toMatchObject({ state: "hlaseni", tier2Count: 1 });
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
      expect(forge).toMatchObject({ state: "klid", tier2Count: 0 });
    });

    it("with no owned activity a subsystem reads as klid with zero counts", async () => {
      const { service } = build({});
      const puls = await service.get("puls");
      expect(puls).toMatchObject({ state: "klid", tier2Count: 0, tier3Count: 0 });
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
      expect(forge).toMatchObject({ state: "klid", tier3Count: 0 });
    });

    it("a run on an unowned pipeline never surfaces for any subsystem", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("orphan")],
        runs: [taskRunFixture({ runId: "orphan_1", kind: "pipeline", owner: "orphan", status: "running" })],
      });
      const rows = await service.list();
      expect(rows.every((r) => r.state === "klid")).toBe(true);
    });

    it("an agent-kind run never attributes (only pipeline/chain owners exist)", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("delivery", "forge")],
        runs: [taskRunFixture({ runId: "koder_1", kind: "agent", owner: "koder", status: "running" })],
      });
      const forge = await service.get("forge");
      expect(forge.state).toBe("klid");
    });
  });

  describe("markSeen", () => {
    it("resets tier2Count to 0 and the state falls back to klid once seen", async () => {
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
      expect(refreshed).toMatchObject({ state: "klid", tier2Count: 0 });
    });

    it("falls back to bezi (not klid) when a run is still active after being seen", async () => {
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
          taskRunFixture({ runId: "delivery_2", kind: "pipeline", owner: "delivery", status: "running" }),
        ],
      });
      const refreshed = await service.markSeen("forge");
      expect(refreshed).toMatchObject({ state: "bezi", tier2Count: 0 });
    });

    it("throws SubsystemNotFoundError for an unknown id", async () => {
      const { service } = build({});
      await expect(service.markSeen("nope")).rejects.toThrow(SubsystemNotFoundError);
    });
  });

  describe("list() — severity ordering", () => {
    it("sorts ceka first, then hlaseni, then bezi, then klid; registry order is the stable tiebreak", async () => {
      const { service } = build({
        pipelines: [
          pipelineFixture("p-beacon", "beacon"),
          pipelineFixture("p-scout", "scout"),
          pipelineFixture("p-forge", "forge"),
        ],
        runs: [
          // forge: running → bezi
          taskRunFixture({ runId: "p-forge_1", kind: "pipeline", owner: "p-forge", status: "running" }),
          // scout: completed after lastSeenAt → hlaseni
          taskRunFixture({
            runId: "p-scout_1",
            kind: "pipeline",
            owner: "p-scout",
            status: "done",
            startedAt: LATER,
          }),
          // beacon: awaiting-approval, attributed below → ceka
          taskRunFixture({
            runId: "p-beacon_1",
            kind: "pipeline",
            owner: "p-beacon",
            status: "awaiting-approval",
          }),
        ],
        pendingApprovals: [approvalFixture({ id: "appr-1", runId: "p-beacon_1", kind: "pipeline-output" })],
      });
      const rows = await service.list();
      const ids = rows.map((r) => r.id);
      const cekaIndex = ids.indexOf("beacon");
      const hlaseniIndex = ids.indexOf("scout");
      const beziIndex = ids.indexOf("forge");
      const klidIndexes = ids
        .map((id, i) => [id, i] as const)
        .filter(([id]) => !["beacon", "scout", "forge"].includes(id))
        .map(([, i]) => i);

      expect(cekaIndex).toBeLessThan(hlaseniIndex);
      expect(hlaseniIndex).toBeLessThan(beziIndex);
      expect(Math.max(beziIndex)).toBeLessThan(Math.min(...klidIndexes));

      // registry-order tiebreak among the untouched `klid` entries.
      const klidIds = klidIndexes.map((i) => ids[i]);
      const registryKlidOrder = SUBSYSTEMS.map((s) => s.id).filter(
        (id) => !["beacon", "scout", "forge"].includes(id),
      );
      expect(klidIds).toEqual(registryKlidOrder);
    });

    it("within ceka, higher tier3Count sorts first", async () => {
      const { service } = build({
        pipelines: [pipelineFixture("p-beacon", "beacon"), pipelineFixture("p-sentinel", "sentinel")],
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
      const ids = rows.filter((r) => r.state === "ceka").map((r) => r.id);
      expect(ids).toEqual(["sentinel", "beacon"]);
    });

    it("all-klid registry stays in registry order (list() still returns all 8)", async () => {
      const { service } = build({});
      const rows = await service.list();
      expect(rows).toHaveLength(8);
      expect(rows.map((r) => r.id)).toEqual(SUBSYSTEMS.map((s) => s.id));
      expect(rows.every((r) => r.state === "klid")).toBe(true);
    });
  });
});
