import { describe, expect, it } from "vitest";
import { ChainRunSchema, ChainSchema } from "./chain.schema";
import { chainRunsContract, chainsContract } from "./chains.contract";

const CHAIN = {
  id: "research-then-build",
  steps: [{ pipeline: "nightly-research" }, { pipeline: "build-feature" }],
  instructions: "Research, then build.",
};

describe("chain.schema", () => {
  it("accepts a minimal chain and rejects an empty steps array", () => {
    expect(ChainSchema.parse(CHAIN)).toEqual(CHAIN);
    expect(ChainSchema.safeParse({ ...CHAIN, steps: [] }).success).toBe(false);
  });

  it("accepts a valid ownerSubsystem tag, rejects an unknown one, omitting stays valid (Phase 81)", () => {
    const tagged = { ...CHAIN, ownerSubsystem: "loom" };
    expect(ChainSchema.parse(tagged)).toEqual(tagged);
    expect(
      ChainSchema.safeParse({ ...CHAIN, ownerSubsystem: "not-a-subsystem" }).success,
    ).toBe(false);
    const parsed = ChainSchema.safeParse(CHAIN);
    expect(parsed.success && parsed.data.ownerSubsystem).toBeUndefined();
  });

  it("chain run: statuses closed; parked carries a reason string", () => {
    const run = {
      chainRunId: "research-then-build_1",
      chainId: "research-then-build",
      status: "parked",
      currentStep: 0,
      steps: [{ index: 0, pipeline: "nightly-research", runRef: "n_1", status: "running" }],
      startedAt: "2026-07-01T10:00:00.000Z",
      parkedReason: "step 0 delivered no consumable artifact",
    };
    expect(ChainRunSchema.parse(run)).toEqual(run);
    expect(ChainRunSchema.safeParse({ ...run, status: "exploded" }).success).toBe(false);
  });
});

describe("chains contracts", () => {
  it("definitions CRUD under /api/chains; runs start/read under /api/chains/runs", () => {
    expect(chainsContract.createChain.path).toBe("/api/chains");
    expect(chainsContract.getChain.path).toBe("/api/chains/:id");
    expect(chainRunsContract.startChain.method).toBe("POST");
    expect(chainRunsContract.startChain.path).toBe("/api/chains/:id/run");
    expect(chainRunsContract.listChainRuns.path).toBe("/api/chains/runs");
  });
});
