import { describe, expect, it } from "vitest";
import type { RunView } from "../runs/run";
import type { OwnerSubsystemMaps } from "../subsystems/useOwnerSubsystem";
import { NO_SUBSYSTEM, archiveSubsystemFilterId } from "./archiveGroups";

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

function maps(overrides: Partial<OwnerSubsystemMaps> = {}): OwnerSubsystemMaps {
  return { pipelineSubsystem: new Map(), ...overrides };
}

describe("archiveSubsystemFilterId / D8 join", () => {
  it("returns NO_SUBSYSTEM for an agent run — no subsystem concept applies at all", () => {
    const id = archiveSubsystemFilterId(run({ kind: "agent", owner: "writer" }), maps());
    expect(id).toBe(NO_SUBSYSTEM);
  });

  it("returns NO_SUBSYSTEM for a goal run", () => {
    const id = archiveSubsystemFilterId(run({ kind: "goal", owner: "g1" }), maps());
    expect(id).toBe(NO_SUBSYSTEM);
  });

  it("returns the tagged subsystem for a pipeline run", () => {
    const id = archiveSubsystemFilterId(
      run({ kind: "pipeline", owner: "delivery" }),
      maps({ pipelineSubsystem: new Map([["delivery", "forge"]]) }),
    );
    expect(id).toBe("forge");
  });

  it("returns NO_SUBSYSTEM for an untagged pipeline owner", () => {
    const id = archiveSubsystemFilterId(run({ kind: "pipeline", owner: "untagged" }), maps());
    expect(id).toBe(NO_SUBSYSTEM);
  });
});
