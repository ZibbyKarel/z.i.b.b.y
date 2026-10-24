import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ActivityEntry, Agent, Approval, GateRule } from "@zibby/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalsService } from "../approvals/approvals.service";
import { ApprovalsStorageService } from "../approvals/approvals.storage.service";
import { ProposalsService, proposalId } from "../proposals/proposals.service";
import { ProposalsStore } from "../proposals/proposals.store";
import { AgentFactoryService } from "./agent-factory.service";
import { AgentProposalFlowService } from "./agent-proposal-flow.service";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const quietLogger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) };

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function makeProposals(approvals: unknown = {}): ProposalsService {
  return new ProposalsService(
    new ProposalsStore(tmp("agent-factory-proposals-")),
    { record: vi.fn(async () => {}) } as never,
    approvals as never,
    quietLogger as never,
  );
}

function fallback(
  summary: string,
  normalizedSummary: string,
  terms: string[],
  daysAgo = 1,
  i = 0,
): ActivityEntry {
  return {
    id: `fb-${normalizedSummary}-${daysAgo}-${i}`,
    at: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    kind: "orchestrator-fallback",
    summary,
    refs: { normalizedSummary, terms: terms.join(",") },
  };
}

function makeService(opts: {
  entries?: ActivityEntry[];
  agents?: Agent[];
  pendingApprovals?: Approval[];
}) {
  const activity = { readRange: vi.fn(async () => opts.entries ?? []) };
  const agents = { list: vi.fn(async () => opts.agents ?? []) };
  const approvals = { list: vi.fn(async () => opts.pendingApprovals ?? []) };
  const flow = {
    propose: vi.fn(async (candidate: Agent) => ({ id: `appr_${candidate.id}` }) as Approval),
  };
  const proposals = makeProposals();
  const svc = new AgentFactoryService(
    activity as never,
    agents as never,
    approvals as never,
    flow as never,
    quietLogger as never,
    proposals,
  );
  return { svc, activity, agents, approvals, flow, proposals };
}

describe("AgentFactoryService.detect", () => {
  it("proposes a candidate once a normalized fallback summary repeats >= 3 times", async () => {
    const entries = [
      fallback("Deploy to Staging!", "deploy to staging", ["deploy", "staging"], 1, 1),
      fallback("deploy to STAGING", "deploy to staging", ["deploy", "staging"], 2, 2),
      fallback("Deploy   to staging", "deploy to staging", ["deploy", "staging"], 3, 3),
    ];
    const { svc, flow } = makeService({ entries });
    const result = await svc.detect(new Date());

    expect(result.proposed).toEqual(["auto-deploy-staging"]);
    expect(flow.propose).toHaveBeenCalledTimes(1);
    const [candidate] = flow.propose.mock.calls[0] as [Agent];
    expect(candidate.id).toBe("auto-deploy-staging");
    expect(candidate.status).toBe("proposed");
    expect(candidate.tools).toEqual(["read"]);
  });

  it("ignores a fallback summary repeated below the 3x threshold", async () => {
    const entries = [
      fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], 1),
      fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], 2),
    ];
    const { svc, flow } = makeService({ entries });
    const result = await svc.detect(new Date());
    expect(result.proposed).toHaveLength(0);
    expect(flow.propose).not.toHaveBeenCalled();
  });

  it("ignores non orchestrator-fallback activity kinds", async () => {
    const entries: ActivityEntry[] = [1, 2, 3].map((i) => ({
      id: `x-${i}`,
      at: new Date().toISOString(),
      kind: "task-created",
      summary: "deploy to staging",
      refs: {},
    }));
    const { svc, flow } = makeService({ entries });
    expect((await svc.detect(new Date())).proposed).toHaveLength(0);
    expect(flow.propose).not.toHaveBeenCalled();
  });

  it("skips a group already covered by an existing agent's name/description/category", async () => {
    const entries = [
      fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], 1, 1),
      fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], 2, 2),
      fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], 3, 3),
    ];
    const covering: Agent = {
      id: "deployer",
      name: "Deployer",
      description: "Handles staging deploys",
      instructions: "x",
    };
    const { svc, flow } = makeService({ entries, agents: [covering] });
    const result = await svc.detect(new Date());
    expect(result.proposed).toHaveLength(0);
    expect(flow.propose).not.toHaveBeenCalled();
  });

  it("does not double-propose when an agent with the candidate id already exists", async () => {
    const entries = [
      fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], 1, 1),
      fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], 2, 2),
      fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], 3, 3),
    ];
    const already: Agent = { id: "auto-deploy-staging", instructions: "x", status: "proposed" };
    const { svc, flow } = makeService({ entries, agents: [already] });
    const result = await svc.detect(new Date());
    expect(result.proposed).toHaveLength(0);
    expect(flow.propose).not.toHaveBeenCalled();
  });

  it("does not double-propose when a pending agent-proposal approval already exists for the candidate id", async () => {
    const entries = [
      fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], 1, 1),
      fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], 2, 2),
      fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], 3, 3),
    ];
    const pendingApprovals: Approval[] = [
      {
        id: "appr_1",
        runId: "auto-deploy-staging",
        kind: "agent-proposal",
        skill: "agent-factory",
        action: "agent.propose_new",
        detail: "{}",
        risk: "medium",
        status: "pending",
        requestedAt: new Date().toISOString(),
      },
    ];
    const { svc, flow } = makeService({ entries, pendingApprovals });
    const result = await svc.detect(new Date());
    expect(result.proposed).toHaveLength(0);
    expect(flow.propose).not.toHaveBeenCalled();
  });

  it("groups distinct fallback patterns independently", async () => {
    const entries = [
      ...[1, 2, 3].map((d) =>
        fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], d, d),
      ),
      ...[4, 5, 6].map((d) =>
        fallback("Fix flaky test", "fix flaky test", ["fix", "flaky", "test"], d, d),
      ),
    ];
    const { svc, flow } = makeService({ entries });
    const result = await svc.detect(new Date());
    expect(result.proposed.sort()).toEqual(["auto-deploy-staging", "auto-fix-flaky-test"].sort());
    expect(flow.propose).toHaveBeenCalledTimes(2);
  });

  describe("proposals (TODO 14)", () => {
    const threeDeploys = () =>
      [1, 2, 3, 4].map((d) =>
        fallback("Deploy to staging", "deploy to staging", ["deploy", "staging"], d, d),
      );

    it("upserts one agent-factory proposal per parked candidate with agentId + approvalId", async () => {
      const { svc, proposals } = makeService({ entries: threeDeploys() });
      await svc.detect(new Date());
      const listed = [...(await proposals.decisions("agent-factory")).values()];
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: proposalId("agent-factory", "auto-deploy-staging"),
        source: "agent-factory",
        occurrences: 4,
        confidence: "medium",
        status: "open",
        provenance: { agentId: "auto-deploy-staging", approvalId: "appr_auto-deploy-staging" },
      });
      expect(listed[0]?.text).toContain("auto-deploy-staging");
    });

    it("does not upsert when the gate discarded the candidate (propose → null)", async () => {
      const { svc, flow, proposals } = makeService({ entries: threeDeploys() });
      flow.propose.mockResolvedValueOnce(null as never);
      await svc.detect(new Date());
      expect((await proposals.decisions("agent-factory")).size).toBe(0);
    });

    it("refreshes lastSeenAt for a candidate still pending approval (no re-propose)", async () => {
      const pendingApprovals: Approval[] = [
        {
          id: "appr_9",
          runId: "auto-deploy-staging",
          kind: "agent-proposal",
          skill: "agent-factory",
          action: "agent.propose_new",
          detail: "{}",
          risk: "medium",
          status: "pending",
          requestedAt: new Date().toISOString(),
        },
      ];
      const { svc, flow, proposals } = makeService({ entries: threeDeploys(), pendingApprovals });
      await svc.detect(new Date());
      expect(flow.propose).not.toHaveBeenCalled();
      const record = (await proposals.decisions("agent-factory")).get(
        proposalId("agent-factory", "auto-deploy-staging"),
      );
      expect(record?.provenance).toEqual({
        agentId: "auto-deploy-staging",
        approvalId: "appr_9",
      });
    });

    it("dismissing the proposal rejects the pending approval exactly like the approvals page (candidate deleted)", async () => {
      const ASK_FLOOR: GateRule[] = [
        {
          id: "floor-agent.propose_new",
          source: "system",
          locked: true,
          match: [{ type: "action", action: "agent.propose_new" }],
          decision: "ask",
          resolve: { type: "human" },
        },
      ];
      const stored = new Map<string, Agent>();
      const agents = {
        list: vi.fn(async () => [...stored.values()]),
        create: vi.fn(async (a: Agent) => {
          stored.set(a.id, a);
          return a;
        }),
        get: vi.fn(async (id: string) => {
          const a = stored.get(id);
          if (!a) throw new Error("not found");
          return a;
        }),
        update: vi.fn(),
        delete: vi.fn(async (id: string) => {
          stored.delete(id);
        }),
      };
      const approvals = new ApprovalsService(
        new ApprovalsStorageService(tmp("agent-factory-approvals-")),
      );
      const gate = {
        floor: vi.fn(async () => ASK_FLOOR),
        evaluate: vi.fn(() => ({ decision: "ask" })),
      };
      const flow = new AgentProposalFlowService(
        approvals,
        gate as never,
        agents as never,
        quietLogger as never,
      );
      flow.onModuleInit();
      const proposals = makeProposals(approvals);
      const svc = new AgentFactoryService(
        { readRange: vi.fn(async () => threeDeploys()) } as never,
        agents as never,
        approvals,
        flow,
        quietLogger as never,
        proposals,
      );

      await svc.detect(new Date());
      const [pending] = await approvals.list("pending");
      expect(pending?.runId).toBe("auto-deploy-staging");
      expect(stored.has("auto-deploy-staging")).toBe(true);

      const id = proposalId("agent-factory", "auto-deploy-staging");
      expect((await proposals.list()).map((p) => p.id)).toEqual([id]);
      const dismissed = await proposals.decide(id, { action: "dismiss" });
      expect(dismissed.status).toBe("dismissed");

      const after = await approvals.get(pending?.id ?? "");
      expect(after.status).toBe("rejected");
      await vi.waitFor(() => expect(agents.delete).toHaveBeenCalledWith("auto-deploy-staging"));
      expect(await proposals.list()).toEqual([]);
    });
  });
});
