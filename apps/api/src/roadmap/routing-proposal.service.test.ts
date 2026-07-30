import type { RoutingProposal } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoggerService } from "../shared/logging/logger.service";
import type { RoadmapGateService } from "./roadmap-gate.service";
import { RoutingProposalService } from "./routing-proposal.service";
import type { RoutingProposalStore } from "./routing-proposal.store";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
} as unknown as LoggerService;

const PROPOSAL: RoutingProposal = {
  id: "routing_1",
  projectId: "acme",
  itemId: "item-1",
  text: "Rollout za flagem",
  projectPath: "/repos/acme",
  pick: { kind: "subsystem", id: "forge", name: "Forge" },
  confidence: 0.55,
  reason: "could be either",
  runnerUp: {
    target: { kind: "subsystem", id: "codex", name: "Codex" },
    confidence: 0.5,
    reason: "also plausible",
  },
  createdAt: "2026-07-30T00:00:00.000Z",
};

describe("RoutingProposalService (NS2 F10)", () => {
  let proposals: {
    get: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let gate: { releaseRouted: ReturnType<typeof vi.fn>; cancelRouting: ReturnType<typeof vi.fn> };
  let approvals: { register: ReturnType<typeof vi.fn> };
  let svc: RoutingProposalService;

  beforeEach(() => {
    proposals = {
      get: vi.fn(async () => PROPOSAL),
      delete: vi.fn(async () => {}),
    };
    gate = { releaseRouted: vi.fn(async () => {}), cancelRouting: vi.fn(async () => {}) };
    approvals = { register: vi.fn() };
    svc = new RoutingProposalService(
      proposals as unknown as RoutingProposalStore,
      gate as unknown as RoadmapGateService,
      approvals as never,
      fakeLogger,
    );
  });

  it("registers itself as the runner for the `routing-proposal` kind", () => {
    svc.onModuleInit();
    expect(approvals.register).toHaveBeenCalledWith("routing-proposal", svc);
  });

  it("approve → releases the parked item to the operator-sanctioned pick, then drops the payload", async () => {
    await svc.resume("routing_1");

    expect(gate.releaseRouted).toHaveBeenCalledWith("acme", "item-1", PROPOSAL.pick);
    expect(proposals.delete).toHaveBeenCalledWith("routing_1");
  });

  it("leaves the payload on disk when the release fails, so the decision can be retried", async () => {
    gate.releaseRouted = vi.fn(async () => {
      throw new Error("worktree unavailable");
    });

    await svc.resume("routing_1");

    // Deleting here would lose the question entirely — the approval is already
    // recorded, so there would be nothing left to act on.
    expect(proposals.delete).not.toHaveBeenCalled();
  });

  it("never throws on resume — the approval decision is already written by then", async () => {
    proposals.get = vi.fn(async () => {
      throw new Error("proposal vanished");
    });

    await expect(svc.resume("routing_1")).resolves.toBeUndefined();
  });

  it("reject → delegates to the gate, which returns the item to the operator", () => {
    svc.cancel("routing_1");

    expect(gate.cancelRouting).toHaveBeenCalledWith("routing_1");
  });
});
