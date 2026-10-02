import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workflow } from "../../domain";
import type { RunView } from "../runs/run";
import { runDepartmentId, useOwnerDepartmentMaps } from "./useOwnerDepartment";

const hooks = vi.hoisted(() => ({
  workflows: [] as Workflow[],
}));

vi.mock("../workflows", () => ({ useWorkflowsQuery: () => ({ data: hooks.workflows }) }));

function workflowFixture(overrides: Partial<Workflow> = {}): Workflow {
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
    kind: "workflow",
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
    hooks.workflows = [];
  });

  it("joins a workflow run to its owning workflow's department", () => {
    hooks.workflows = [workflowFixture({ id: "delivery", department: "dev" })];
    const { result } = renderHook(() => useOwnerDepartmentMaps());

    const run = runFixture({ kind: "workflow", owner: "delivery" });
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

  it("returns null (not a crash) for a workflow run whose owner is untagged or unknown", () => {
    hooks.workflows = [workflowFixture({ id: "untagged" })];
    const { result } = renderHook(() => useOwnerDepartmentMaps());

    expect(
      runDepartmentId(runFixture({ kind: "workflow", owner: "untagged" }), result.current),
    ).toBeNull();
    expect(
      runDepartmentId(runFixture({ kind: "workflow", owner: "does-not-exist" }), result.current),
    ).toBeNull();
  });
});
