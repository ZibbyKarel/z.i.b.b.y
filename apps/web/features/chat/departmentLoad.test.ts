import type { Agent } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import type { Pipeline } from "../../domain";
import type { RunView } from "../runs/run";
import { MAX_ORBITERS, activeRunsBySubsystem } from "./subsystemLoad";

function pipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    id: "delivery",
    name: "Delivery",
    lastRun: "—",
    lastState: "done",
    desc: "",
    file: "~/zibby/pipelines/delivery.pipeline.md",
    phases: [],
    outputs: [],
    ...overrides,
  };
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "koder",
    name: "Kodér",
    instructions: "x",
    ...overrides,
  } as Agent;
}

function run(overrides: Partial<RunView> = {}): RunView {
  return {
    runId: "delivery_1",
    kind: "pipeline",
    owner: "delivery",
    processor: { kind: "pipeline", id: "delivery", name: "Delivery" },
    status: "running",
    prompt: "",
    startedAt: "2026-07-08T00:00:00.000Z",
    ...overrides,
  } as RunView;
}

describe("activeRunsBySubsystem", () => {
  it("counts running/queued runs by their pipeline's ownerSubsystem", () => {
    const pipelines = [
      pipeline({ id: "forge-a", ownerSubsystem: "forge" }),
      pipeline({ id: "forge-b", ownerSubsystem: "forge" }),
      pipeline({ id: "loom-a", ownerSubsystem: "loom" }),
    ];
    const runs = [
      run({ runId: "r1", owner: "forge-a", status: "running" }),
      run({ runId: "r2", owner: "forge-b", status: "queued" }),
      run({ runId: "r3", owner: "loom-a", status: "running" }),
      // Terminal — must be ignored.
      run({ runId: "r4", owner: "forge-a", status: "done" }),
    ];

    expect(activeRunsBySubsystem(runs, pipelines, [])).toEqual({ forge: 2, loom: 1 });
  });

  it("ignores runs whose pipeline has no ownerSubsystem tag", () => {
    const pipelines = [pipeline({ id: "untagged" })];
    const runs = [run({ runId: "r1", owner: "untagged", status: "running" })];

    expect(activeRunsBySubsystem(runs, pipelines, [])).toEqual({});
  });

  it("a running agent-kind run whose agent has ownerSubsystem gives that subsystem a count of 1", () => {
    const runs = [run({ runId: "r1", kind: "agent", owner: "koder", status: "running" })];
    const agents = [agent({ ownerSubsystem: "forge" })];

    expect(activeRunsBySubsystem(runs, [], agents)).toEqual({ forge: 1 });
  });

  it("ignores an agent-kind run whose agent has no ownerSubsystem tag", () => {
    const runs = [run({ runId: "r1", kind: "agent", owner: "koder", status: "running" })];
    const agents = [agent()];

    expect(activeRunsBySubsystem(runs, [], agents)).toEqual({});
  });

  it("mixed agent + pipeline runs owned by the same subsystem sum together", () => {
    const pipelines = [pipeline({ id: "delivery", ownerSubsystem: "forge" })];
    const agents = [agent({ id: "koder", ownerSubsystem: "forge" })];
    const runs = [
      run({ runId: "r1", kind: "pipeline", owner: "delivery", status: "running" }),
      run({ runId: "r2", kind: "agent", owner: "koder", status: "running" }),
    ];

    expect(activeRunsBySubsystem(runs, pipelines, agents)).toEqual({ forge: 2 });
  });

  it("a goal-kind run never attributes (D16)", () => {
    const agents = [agent({ ownerSubsystem: "forge" })];
    const runs = [run({ runId: "r1", kind: "goal", owner: "koder", status: "running" })];

    expect(activeRunsBySubsystem(runs, [], agents)).toEqual({});
  });

  it("caps a subsystem's count at MAX_ORBITERS (pipeline runs)", () => {
    const pipelines = [pipeline({ id: "forge-a", ownerSubsystem: "forge" })];
    const runs = Array.from({ length: MAX_ORBITERS + 4 }, (_, i) =>
      run({ runId: `r${i}`, owner: "forge-a", status: "running" }),
    );

    expect(activeRunsBySubsystem(runs, pipelines, [])).toEqual({ forge: MAX_ORBITERS });
  });

  it("caps a subsystem's count at MAX_ORBITERS (agent runs)", () => {
    const agents = [agent({ id: "koder", ownerSubsystem: "forge" })];
    const runs = Array.from({ length: MAX_ORBITERS + 4 }, (_, i) =>
      run({ runId: `r${i}`, kind: "agent", owner: "koder", status: "running" }),
    );

    expect(activeRunsBySubsystem(runs, [], agents)).toEqual({ forge: MAX_ORBITERS });
  });
});
