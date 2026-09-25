import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HandoffRule, HandoffSignal } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HandoffFiredStore } from "./handoff-fired.store";
import { HandoffProposalStore } from "./handoff-proposal.store";
import { HandoffRuleStore } from "./handoff-rule.store";
import { HandoffSignalKindStore } from "./handoff-signal-kind.store";
import { HandoffService } from "./handoff.service";

const fakeLogger = {
  child: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
};

/** A small, controlled fixture rule set — one rule per tier plus a pipeline target,
 *  deliberately NOT the seeded system rules, so each test's matching is unambiguous. */
const RULES: HandoffRule[] = [
  {
    id: "security-tier1",
    from: "sec",
    signalKind: "cve",
    minSeverity: "critical",
    to: { kind: "department", id: "dev" },
    tier: 1,
    enabled: true,
  },
  {
    id: "release-tier2",
    from: "rel",
    signalKind: "post-merge-red",
    to: { kind: "department", id: "dev" },
    tier: 2,
    enabled: true,
  },
  {
    id: "arch-tier3",
    from: "qa",
    signalKind: "*",
    to: { kind: "department", id: "dev" },
    tier: 3,
    enabled: true,
  },
  {
    id: "research-pipeline-tier2",
    from: "rnd",
    signalKind: "research-artifact",
    to: { kind: "pipeline", id: "delivery" },
    tier: 2,
    enabled: true,
  },
];

let seq = 0;
const cveSignal = (over: Partial<HandoffSignal> = {}): HandoffSignal => {
  seq += 1;
  return {
    from: "sec",
    kind: "cve",
    severity: "critical",
    title: `Kritická CVE ${seq}`,
    body: "Balíček má kritickou zranitelnost.",
    fingerprint: `fp-${seq}`,
    ...over,
  };
};

describe("HandoffService", () => {
  let dir: string;
  let ruleStore: HandoffRuleStore;
  let proposalStore: HandoffProposalStore;
  let firedStore: HandoffFiredStore;
  let signalKindStore: HandoffSignalKindStore;
  let scheduler: { createTask: ReturnType<typeof vi.fn> };
  let approvals: {
    register: ReturnType<typeof vi.fn>;
    requestApproval: ReturnType<typeof vi.fn>;
  };
  let activity: { record: ReturnType<typeof vi.fn> };
  let pipelines: { get: ReturnType<typeof vi.fn> };
  let service: HandoffService;
  let approvalSeq: number;
  let taskSeq: number;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    seq = 0;
    approvalSeq = 0;
    taskSeq = 0;

    const rulesFile = path.join(dir, "rules.json");
    await fs.writeFile(rulesFile, JSON.stringify(RULES));
    ruleStore = new HandoffRuleStore(rulesFile, fakeLogger as never);
    await ruleStore.onModuleInit();

    proposalStore = new HandoffProposalStore(path.join(dir, "proposals"));
    firedStore = new HandoffFiredStore(path.join(dir, "fired"), fakeLogger as never);

    signalKindStore = new HandoffSignalKindStore(
      path.join(dir, "signal-kinds.json"),
      fakeLogger as never,
    );
    await signalKindStore.onModuleInit();

    scheduler = {
      createTask: vi.fn(
        async (input: unknown, _now: number, _projectId: unknown, target: unknown) => {
          taskSeq += 1;
          return {
            outcome: "dispatched",
            runRef: `run_${taskSeq}`,
            target,
            task: { id: `task_${taskSeq}` },
          };
        },
      ),
    };
    approvals = {
      register: vi.fn(),
      requestApproval: vi.fn(async (input: { runId: string }) => {
        approvalSeq += 1;
        return { id: `appr_${approvalSeq}`, runId: input.runId };
      }),
    };
    activity = { record: vi.fn(async () => {}) };
    pipelines = {
      get: vi.fn(async (id: string) => {
        if (id === "delivery") return { id: "delivery", name: "Delivery Pipeline" };
        throw new Error("not found");
      }),
    };

    service = new HandoffService(
      ruleStore,
      proposalStore,
      firedStore,
      signalKindStore,
      scheduler as never,
      approvals as never,
      activity as never,
      pipelines as never,
      // ZB-05a — chain lookup only; no test in this file dispatches a real chain
      // hop end to end (that's chain-view.test.ts / the chain e2e spec).
      { get: vi.fn(async () => null) } as never,
      fakeLogger as never,
    );
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("registers itself as the handoff-proposal runner on init", () => {
    service.onModuleInit();
    expect(approvals.register).toHaveBeenCalledWith("handoff-proposal", service);
  });

  it("Tier 1: dispatches silently — createTask called, no activity record", async () => {
    const outcome = await service.evaluate(cveSignal());
    expect(scheduler.createTask).toHaveBeenCalledTimes(1);
    const [input, , , target] = scheduler.createTask.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      unknown,
    ];
    expect(input).toEqual({
      title: expect.stringContaining("Kritická CVE"),
      text: "Balíček má kritickou zranitelnost.",
      paths: [],
      source: "handoff",
    });
    expect(target).toEqual({ kind: "department", id: "dev", name: "Development" });
    expect(activity.record).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      action: "dispatched",
      runRef: "run_1",
      target: { kind: "department", id: "dev" },
    });
  });

  it("Tier 2: dispatches AND records a handoff activity entry", async () => {
    const outcome = await service.evaluate({
      from: "rel",
      kind: "post-merge-red",
      title: "CI red after merge",
      body: "Investigate and fix.",
      fingerprint: "pm-1",
      projectId: "proj_1",
    });
    expect(scheduler.createTask).toHaveBeenCalledTimes(1);
    expect(activity.record).toHaveBeenCalledTimes(1);
    const [entry] = activity.record.mock.calls[0] as [
      { kind: string; refs: Record<string, unknown> },
    ];
    expect(entry.kind).toBe("handoff");
    expect(entry.refs).toMatchObject({
      runRef: "run_1",
      projectId: "proj_1",
      department: "dev",
    });
    expect(outcome.action).toBe("dispatched");
  });

  it("Tier 2 with a pipeline target resolves the pipeline's display name", async () => {
    await service.evaluate({
      from: "rnd",
      kind: "research-artifact",
      title: "Research artifact ready",
      body: "Build it.",
      fingerprint: "art-1",
    });
    const [, , , target] = scheduler.createTask.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      unknown,
    ];
    expect(pipelines.get).toHaveBeenCalledWith("delivery");
    expect(target).toEqual({ kind: "pipeline", id: "delivery", name: "Delivery Pipeline" });
  });

  it("Tier 3: does NOT dispatch — parks a proposal and requests a handoff-proposal approval", async () => {
    const outcome = await service.evaluate({
      from: "qa",
      kind: "god-node",
      title: "God node found",
      body: "graph.ts has too many incoming edges.",
      fingerprint: "arch-1",
    });
    expect(scheduler.createTask).not.toHaveBeenCalled();
    expect(approvals.requestApproval).toHaveBeenCalledTimes(1);
    const [input] = approvals.requestApproval.mock.calls[0] as [{ runId: string; kind: string }];
    expect(input.kind).toBe("handoff-proposal");
    expect(outcome).toEqual({ action: "proposed", approvalId: "appr_1" });
    // The proposal is durably stored under the runId handed to approvals.
    const stored = await proposalStore.get(input.runId);
    expect(stored.ruleId).toBe("arch-tier3");
    expect(stored.signal.fingerprint).toBe("arch-1");
  });

  it("resume(proposalId) dispatches the parked payload's target and deletes the proposal", async () => {
    await service.evaluate({
      from: "qa",
      kind: "cycle",
      title: "Import cycle found",
      body: "a.ts <-> b.ts",
      fingerprint: "arch-2",
    });
    const [input] = approvals.requestApproval.mock.calls[0] as [{ runId: string }];
    const proposalId = input.runId;

    await service.resume(proposalId);

    expect(scheduler.createTask).toHaveBeenCalledTimes(1);
    const [taskInput, , , target] = scheduler.createTask.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      unknown,
    ];
    expect(taskInput).toEqual({
      title: "Import cycle found",
      text: "a.ts <-> b.ts",
      paths: [],
      source: "handoff",
    });
    expect(target).toEqual({ kind: "department", id: "dev", name: "Development" });
    await expect(proposalStore.get(proposalId)).rejects.toThrow();
  });

  it("cancel(proposalId) deletes the proposal without dispatching", async () => {
    await service.evaluate({
      from: "qa",
      kind: "community",
      title: "Community cluster found",
      body: "details",
      fingerprint: "arch-3",
    });
    const [input] = approvals.requestApproval.mock.calls[0] as [{ runId: string }];
    const proposalId = input.runId;

    service.cancel(proposalId);
    // cancel is fire-and-forget (interface returns void) — flush microtasks.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scheduler.createTask).not.toHaveBeenCalled();
    await expect(proposalStore.get(proposalId)).rejects.toThrow();
  });

  it("severity gate: minSeverity critical rejects a high signal, accepts a critical one", async () => {
    const highOutcome = await service.evaluate(cveSignal({ severity: "high" }));
    expect(highOutcome).toEqual({ action: "none" });
    expect(scheduler.createTask).not.toHaveBeenCalled();

    const criticalOutcome = await service.evaluate(cveSignal({ severity: "critical" }));
    expect(criticalOutcome.action).toBe("dispatched");
    expect(scheduler.createTask).toHaveBeenCalledTimes(1);
  });

  it("wildcard signalKind matches any kind from that department", async () => {
    for (const kind of ["god-node", "cycle", "community"]) {
      const outcome = await service.evaluate({
        from: "qa",
        kind,
        title: `Arch finding: ${kind}`,
        body: "details",
        fingerprint: `wild-${kind}`,
      });
      expect(outcome.action).toBe("proposed");
    }
    expect(approvals.requestApproval).toHaveBeenCalledTimes(3);
  });

  it("idempotency: the same (ruleId, fingerprint) evaluated twice dispatches once", async () => {
    const signal: HandoffSignal = {
      from: "rel",
      kind: "post-merge-red",
      title: "CI red",
      body: "fix it",
      fingerprint: "same-fp",
    };
    const first = await service.evaluate(signal);
    const second = await service.evaluate(signal);
    expect(first.action).toBe("dispatched");
    expect(second).toEqual({ action: "none" });
    expect(scheduler.createTask).toHaveBeenCalledTimes(1);
  });

  it("no matching rule → none, no dispatch (e.g. a leaked secret with no matching rule)", async () => {
    const outcome = await service.evaluate({
      from: "sec",
      kind: "secret",
      title: "Leaked secret",
      body: "found a key in the repo",
      fingerprint: "secret-1",
    });
    expect(outcome).toEqual({ action: "none" });
    expect(scheduler.createTask).not.toHaveBeenCalled();
    expect(approvals.requestApproval).not.toHaveBeenCalled();
  });

  it("fails open: a thrown error from the dispatch path resolves to none, never throws", async () => {
    scheduler.createTask.mockRejectedValueOnce(new Error("boom"));
    const outcome = await service.evaluate(cveSignal());
    expect(outcome).toEqual({ action: "none" });
  });

  describe("B4 auto-activation (markSeen)", () => {
    it("flips a pending operator signal kind to active on its first real emission, even with no matching rule", async () => {
      const registered = await signalKindStore.create({
        from: "sec",
        label: "Dependency outdated",
        description: "A dependency has fallen behind its latest release.",
        severityBearing: false,
      });
      expect(registered.status).toBe("pending");

      const outcome = await service.evaluate({
        from: "sec",
        kind: registered.id,
        title: "Dependency outdated",
        body: "lodash is 3 majors behind",
        fingerprint: "dep-1",
      });

      // No rule targets this kind, so evaluate still correctly no-ops on dispatch...
      expect(outcome).toEqual({ action: "none" });
      expect(scheduler.createTask).not.toHaveBeenCalled();
      // ...but the signal kind is now marked active regardless.
      const kinds = await signalKindStore.list();
      expect(kinds.find((k) => k.id === registered.id)?.status).toBe("active");
    });

    it("leaves built-in kinds' status untouched on emission", async () => {
      await service.evaluate(cveSignal());
      const kinds = await signalKindStore.list();
      expect(kinds.find((k) => k.id === "cve")?.status).toBe("builtin");
    });
  });
});
