import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pipeline } from "../../domain";
import type { RunView } from "../runs/run";
import { runDepartmentId, useOwnerDepartmentMaps } from "./useOwnerDepartment";

const hooks = vi.hoisted(() => ({
  pipelines: [] as Pipeline[],
}));

vi.mock("../pipelines", () => ({ usePipelinesQuery: () => ({ data: hooks.pipelines }) }));

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

describe("useOwnerDepartment", () => {
  beforeEach(() => {
    hooks.pipelines = [];
  });

  it("joins a pipeline run to its owning pipeline's department", () => {
    hooks.pipelines = [pipelineFixture({ id: "delivery", department: "dev" })];
    const { result } = renderHook(() => useOwnerDepartmentMaps());

    const run = runFixture({ kind: "pipeline", owner: "delivery" });
    expect(runDepartmentId(run, result.current)).toBe("dev");
  });

  it("returns null for an agent run — agent runs have no department concept at all", () => {
    const { result } = renderHook(() => useOwnerDepartmentMaps());
    const run = runFixture({ kind: "agent", owner: "writer" });
    expect(runDepartmentId(run, result.current)).toBeNull();
  });

  it("returns null for a goal run — goal runs have no department concept at all", () => {
    const { result } = renderHook(() => useOwnerDepartmentMaps());
    const run = runFixture({ kind: "goal", owner: "some-goal" });
    expect(runDepartmentId(run, result.current)).toBeNull();
  });

  it("returns null (not a crash) for a pipeline run whose owner is untagged or unknown", () => {
    hooks.pipelines = [pipelineFixture({ id: "untagged" })];
    const { result } = renderHook(() => useOwnerDepartmentMaps());

    expect(
      runDepartmentId(runFixture({ kind: "pipeline", owner: "untagged" }), result.current),
    ).toBeNull();
    expect(
      runDepartmentId(runFixture({ kind: "pipeline", owner: "does-not-exist" }), result.current),
    ).toBeNull();
  });
});
