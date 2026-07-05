import type { ActivityEntry, Agent, Approval } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { AgentFactoryService } from "./agent-factory.service";

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
  const flow = { propose: vi.fn(async (_candidate: Agent) => {}) };
  const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) };
  const svc = new AgentFactoryService(
    activity as never,
    agents as never,
    approvals as never,
    flow as never,
    logger as never,
  );
  return { svc, activity, agents, approvals, flow };
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
});
