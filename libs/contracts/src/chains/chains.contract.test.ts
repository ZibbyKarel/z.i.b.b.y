import { describe, expect, it } from "vitest";
import { DeleteResponseSchema, EmptyBodySchema } from "../common.schema";
import { ChainRunSchema, ChainRunStepSchema, ChainSchema, ChainStepSchema } from "./chain.schema";
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

  it("deleteChain's 200 response IS the shared DeleteResponseSchema (T11 dedup, finding #9)", () => {
    expect(chainsContract.deleteChain.responses[200]).toBe(DeleteResponseSchema);
  });

  it("startChain's empty body IS the shared EmptyBodySchema (T11 dedup, finding #37)", () => {
    expect(chainRunsContract.startChain.body).toBe(EmptyBodySchema);
  });
});

describe("T11 finding #3 — pipeline id labeling (PipelineIdSchema alias, not branded)", () => {
  it("ChainStepSchema.pipeline rejects a value that isn't a valid id shape (bare z.string() would have accepted it)", () => {
    expect(ChainStepSchema.safeParse({ pipeline: "nightly-research" }).success).toBe(true);
    expect(ChainStepSchema.safeParse({ pipeline: "a/b" }).success).toBe(false);
    expect(ChainStepSchema.safeParse({ pipeline: "" }).success).toBe(false);
  });

  it("ChainRunStepSchema.pipeline now rejects a path-separator value that bare z.string().min(1) previously accepted", () => {
    const base = { index: 0, status: "running" as const };
    // Previously valid under the old `z.string().min(1)` — now caught by the id shape.
    expect(ChainRunStepSchema.safeParse({ ...base, pipeline: "a/b" }).success).toBe(false);
    expect(ChainRunStepSchema.safeParse({ ...base, pipeline: "nightly-research" }).success).toBe(
      true,
    );
  });
});
