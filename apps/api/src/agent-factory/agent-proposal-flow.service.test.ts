import type { Agent, GateRule } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RequestApprovalInput } from "../approvals/approvals.service";
import { AgentProposalFlowService } from "./agent-proposal-flow.service";

const CANDIDATE: Agent = {
  id: "auto-deploy-staging",
  name: "Deploy Staging Specialist",
  description: "Proposed after 3 orchestrator fallbacks matching deploy to staging",
  category: "Proposed",
  status: "proposed",
  tools: ["read"],
  instructions: "Handle deploy-to-staging tasks.",
};

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

function makeService(opts: {
  floor?: GateRule[];
  evaluateDecision?: "allow" | "ask" | "deny" | "notify";
  storedAgents?: Record<string, Agent>;
}) {
  const stored = new Map<string, Agent>(Object.entries(opts.storedAgents ?? {}));
  const approvals = {
    register: vi.fn(),
    requestApproval: vi.fn(async (_input: RequestApprovalInput) => ({ id: "appr_1" })),
  };
  const gate = {
    floor: vi.fn(async () => opts.floor ?? ASK_FLOOR),
    evaluate: vi.fn(() => ({ decision: opts.evaluateDecision ?? "ask" })),
  };
  const agents = {
    create: vi.fn(async (input: Agent) => {
      stored.set(input.id, input);
      return input;
    }),
    get: vi.fn(async (id: string) => {
      const a = stored.get(id);
      if (!a) throw new Error("not found");
      return a;
    }),
    update: vi.fn(async (id: string, patch: Partial<Agent>) => {
      const merged = { ...stored.get(id), ...patch, id } as Agent;
      stored.set(id, merged);
      return merged;
    }),
    delete: vi.fn(async (id: string) => {
      stored.delete(id);
    }),
  };
  const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) };
  const svc = new AgentProposalFlowService(
    approvals as never,
    gate as never,
    agents as never,
    logger as never,
  );
  return { svc, approvals, gate, agents, stored };
}

describe("AgentProposalFlowService", () => {
  it("registers itself for the agent-proposal approval kind on module init", () => {
    const { svc, approvals } = makeService({});
    svc.onModuleInit();
    expect(approvals.register).toHaveBeenCalledWith("agent-proposal", svc);
  });

  describe("propose", () => {
    it("writes the candidate as status: proposed, then parks a pending approval with enrichment JSON detail", async () => {
      const { svc, agents, approvals } = makeService({});
      await svc.propose(CANDIDATE);

      expect(agents.create).toHaveBeenCalledWith(expect.objectContaining({ status: "proposed" }));
      expect(approvals.requestApproval).toHaveBeenCalledTimes(1);
      const call = approvals.requestApproval.mock.calls[0]![0];
      expect(call.kind).toBe("agent-proposal");
      expect(call.runId).toBe("auto-deploy-staging");
      expect(call.action).toBe("agent.propose_new");

      const detail = JSON.parse(call.detail);
      expect(detail.summary).toContain(
        "auto-deploy-staging".replace("auto-deploy-staging", "Deploy Staging Specialist"),
      );
      expect(detail.preview.kind).toBe("diff");
      expect(detail.preview.file).toBe("auto-deploy-staging.md");
      expect(detail.preview.hunks[0].lines.length).toBeGreaterThan(0);
    });

    it("tags the parked approval's detail with source: agent-factory (NS2 F0c)", async () => {
      const { svc, approvals } = makeService({});
      await svc.propose(CANDIDATE);
      const call = approvals.requestApproval.mock.calls[0]![0];
      const detail = JSON.parse(call.detail);
      expect(detail.source).toBe("agent-factory");
    });

    it("evaluates agent.propose_new against the gate floor with the candidate id as scope", async () => {
      const { svc, gate } = makeService({});
      await svc.propose(CANDIDATE);
      expect(gate.evaluate).toHaveBeenCalledWith(
        ASK_FLOOR,
        expect.objectContaining({ action: "agent.propose_new", scope: "auto-deploy-staging" }),
      );
    });

    it("discards the candidate file (no approval parked) when the gate denies", async () => {
      const { svc, agents, approvals } = makeService({ evaluateDecision: "deny" });
      await svc.propose(CANDIDATE);
      expect(approvals.requestApproval).not.toHaveBeenCalled();
      expect(agents.delete).toHaveBeenCalledWith("auto-deploy-staging");
    });
  });

  describe("resume (approve)", () => {
    it("flips a proposed candidate to status: active", async () => {
      const { svc, agents } = makeService({ storedAgents: { [CANDIDATE.id]: CANDIDATE } });
      await svc.resume(CANDIDATE.id);
      expect(agents.update).toHaveBeenCalledWith(CANDIDATE.id, { status: "active" });
    });

    it("is a no-op when the agent is not a pending proposed candidate", async () => {
      const active = { ...CANDIDATE, status: "active" as const };
      const { svc, agents } = makeService({ storedAgents: { [CANDIDATE.id]: active } });
      await svc.resume(CANDIDATE.id);
      expect(agents.update).not.toHaveBeenCalled();
    });

    it("is a no-op when the agent no longer exists", async () => {
      const { svc, agents } = makeService({});
      await svc.resume("missing");
      expect(agents.update).not.toHaveBeenCalled();
    });
  });

  describe("cancel (reject)", () => {
    it("deletes a proposed candidate file", async () => {
      const { svc, agents } = makeService({ storedAgents: { [CANDIDATE.id]: CANDIDATE } });
      svc.cancel(CANDIDATE.id);
      await vi.waitFor(() => expect(agents.delete).toHaveBeenCalledWith(CANDIDATE.id));
    });

    it("does not delete an agent that is no longer proposed (already activated)", async () => {
      const active = { ...CANDIDATE, status: "active" as const };
      const { svc, agents } = makeService({ storedAgents: { [CANDIDATE.id]: active } });
      svc.cancel(CANDIDATE.id);
      await Promise.resolve();
      await Promise.resolve();
      expect(agents.delete).not.toHaveBeenCalled();
    });
  });
});
