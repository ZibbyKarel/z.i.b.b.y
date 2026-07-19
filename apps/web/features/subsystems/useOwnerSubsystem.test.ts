import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chain } from "@zibby/contracts";
import type { Pipeline } from "../../domain";
import type { RunView } from "../runs/run";
import { runSubsystemId, useOwnerSubsystemMaps } from "./useOwnerSubsystem";

const hooks = vi.hoisted(() => ({
  pipelines: [] as Pipeline[],
  chains: [] as Chain[],
}));

vi.mock("../pipelines", () => ({ usePipelinesQuery: () => ({ data: hooks.pipelines }) }));
vi.mock("../chains", () => ({ useChainsQuery: () => ({ data: hooks.chains }) }));

function pipelineFixture(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    id: "delivery",
    name: "Delivery",
    lastRun: "—",
    lastState: "done",
    desc: "",
    file: "f",
    outputs: [],
    phases: [],
    ...overrides,
  };
}

function chainFixture(overrides: Partial<Chain> = {}): Chain {
  return {
    id: "forge-chain",
    name: "Forge Chain",
    steps: [{ pipeline: "delivery" }],
    ...overrides,
  };
}

function runFixture(overrides: Partial<RunView> = {}): RunView {
  return {
    runId: "run-1",
    kind: "pipeline",
    owner: "delivery",
    status: "running",
    pct: null,
    title: "",
    prompt: "",
    project: "",
    startedAt: new Date().toISOString(),
    logBase: null,
    ...overrides,
  };
}

describe("useOwnerSubsystem", () => {
  beforeEach(() => {
    hooks.pipelines = [];
    hooks.chains = [];
  });

  it("joins a pipeline run to its owning pipeline's ownerSubsystem", () => {
    hooks.pipelines = [pipelineFixture({ id: "delivery", ownerSubsystem: "forge" })];
    const { result } = renderHook(() => useOwnerSubsystemMaps());

    const run = runFixture({ kind: "pipeline", owner: "delivery" });
    expect(runSubsystemId(run, result.current)).toBe("forge");
  });

  it("joins a chain run to its owning chain's ownerSubsystem", () => {
    hooks.chains = [chainFixture({ id: "forge-chain", ownerSubsystem: "loom" })];
    const { result } = renderHook(() => useOwnerSubsystemMaps());

    const run = runFixture({ kind: "chain", owner: "forge-chain" });
    expect(runSubsystemId(run, result.current)).toBe("loom");
  });

  it("returns null for an agent run — agent runs have no subsystem concept at all", () => {
    const { result } = renderHook(() => useOwnerSubsystemMaps());
    const run = runFixture({ kind: "agent", owner: "writer" });
    expect(runSubsystemId(run, result.current)).toBeNull();
  });

  it("returns null for a goal run — goal runs have no subsystem concept at all", () => {
    const { result } = renderHook(() => useOwnerSubsystemMaps());
    const run = runFixture({ kind: "goal", owner: "some-goal" });
    expect(runSubsystemId(run, result.current)).toBeNull();
  });

  it("returns null (not a crash) for a pipeline/chain run whose owner is untagged or unknown", () => {
    hooks.pipelines = [pipelineFixture({ id: "untagged" })];
    const { result } = renderHook(() => useOwnerSubsystemMaps());

    expect(
      runSubsystemId(runFixture({ kind: "pipeline", owner: "untagged" }), result.current),
    ).toBeNull();
    expect(
      runSubsystemId(runFixture({ kind: "pipeline", owner: "does-not-exist" }), result.current),
    ).toBeNull();
  });
});
