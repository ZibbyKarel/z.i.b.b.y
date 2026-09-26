import { describe, expect, it } from "vitest";
import type { RunView } from "../runs/run";
import type { OwnerDepartmentMaps } from "../departments/useOwnerDepartment";
import { NO_DEPARTMENT, archiveDepartmentFilterId } from "./archiveGroups";

function run(overrides: Partial<RunView> = {}): RunView {
  return {
    runId: "r_1",
    kind: "agent",
    owner: "writer",
    status: "done",
    pct: null,
    title: "",
    prompt: "",
    project: "",
    startedAt: new Date().toISOString(),
    logBase: "agents",
    ...overrides,
  };
}

function maps(overrides: Partial<OwnerDepartmentMaps> = {}): OwnerDepartmentMaps {
  return { pipelineDepartment: new Map(), ...overrides };
}

describe("archiveDepartmentFilterId / D8 join", () => {
  it("returns NO_DEPARTMENT for an agent run — no department concept applies at all", () => {
    const id = archiveDepartmentFilterId(run({ kind: "agent", owner: "writer" }), maps());
    expect(id).toBe(NO_DEPARTMENT);
  });

  it("returns NO_DEPARTMENT for a goal run", () => {
    const id = archiveDepartmentFilterId(run({ kind: "goal", owner: "g1" }), maps());
    expect(id).toBe(NO_DEPARTMENT);
  });

  it("returns the tagged department for a pipeline run", () => {
    const id = archiveDepartmentFilterId(
      run({ kind: "pipeline", owner: "delivery" }),
      maps({ pipelineDepartment: new Map([["delivery", "dev"]]) }),
    );
    expect(id).toBe("dev");
  });

  it("returns NO_DEPARTMENT for an untagged pipeline owner", () => {
    const id = archiveDepartmentFilterId(run({ kind: "pipeline", owner: "untagged" }), maps());
    expect(id).toBe(NO_DEPARTMENT);
  });
});
