import type { Agent } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import type { Pipeline } from "../../domain";
import type { RunView } from "../runs/run";
import { MAX_ORBITERS, activeRunsByDepartment } from "./departmentLoad";

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

describe("activeRunsByDepartment", () => {
  it("counts running/queued runs by their pipeline's department", () => {
    const pipelines = [
      pipeline({ id: "dev-a", department: "dev" }),
      pipeline({ id: "dev-b", department: "dev" }),
      pipeline({ id: "arch-a", department: "qa" }),
    ];
    const runs = [
      run({ runId: "r1", owner: "dev-a", status: "running" }),
      run({ runId: "r2", owner: "dev-b", status: "queued" }),
      run({ runId: "r3", owner: "arch-a", status: "running" }),
      // Terminal — must be ignored.
      run({ runId: "r4", owner: "dev-a", status: "done" }),
    ];

    expect(activeRunsByDepartment(runs, pipelines, [])).toEqual({ dev: 2, qa: 1 });
  });

  it("ignores runs whose pipeline has no department tag", () => {
    const pipelines = [pipeline({ id: "untagged" })];
    const runs = [run({ runId: "r1", owner: "untagged", status: "running" })];

    expect(activeRunsByDepartment(runs, pipelines, [])).toEqual({});
  });

  it("a running agent-kind run whose agent has department gives that department a count of 1", () => {
    const runs = [run({ runId: "r1", kind: "agent", owner: "koder", status: "running" })];
    const agents = [agent({ department: "dev" })];

    expect(activeRunsByDepartment(runs, [], agents)).toEqual({ dev: 1 });
  });

  it("ignores an agent-kind run whose agent has no department tag", () => {
    const runs = [run({ runId: "r1", kind: "agent", owner: "koder", status: "running" })];
    const agents = [agent()];

    expect(activeRunsByDepartment(runs, [], agents)).toEqual({});
  });

  it("mixed agent + pipeline runs owned by the same department sum together", () => {
    const pipelines = [pipeline({ id: "delivery", department: "dev" })];
    const agents = [agent({ id: "koder", department: "dev" })];
    const runs = [
      run({ runId: "r1", kind: "pipeline", owner: "delivery", status: "running" }),
      run({ runId: "r2", kind: "agent", owner: "koder", status: "running" }),
    ];

    expect(activeRunsByDepartment(runs, pipelines, agents)).toEqual({ dev: 2 });
  });

  it("a goal-kind run never attributes (D16)", () => {
    const agents = [agent({ department: "dev" })];
    const runs = [run({ runId: "r1", kind: "goal", owner: "koder", status: "running" })];

    expect(activeRunsByDepartment(runs, [], agents)).toEqual({});
  });

  it("caps a department's count at MAX_ORBITERS (pipeline runs)", () => {
    const pipelines = [pipeline({ id: "dev-a", department: "dev" })];
    const runs = Array.from({ length: MAX_ORBITERS + 4 }, (_, i) =>
      run({ runId: `r${i}`, owner: "dev-a", status: "running" }),
    );

    expect(activeRunsByDepartment(runs, pipelines, [])).toEqual({ dev: MAX_ORBITERS });
  });

  it("caps a department's count at MAX_ORBITERS (agent runs)", () => {
    const agents = [agent({ id: "koder", department: "dev" })];
    const runs = Array.from({ length: MAX_ORBITERS + 4 }, (_, i) =>
      run({ runId: `r${i}`, kind: "agent", owner: "koder", status: "running" }),
    );

    expect(activeRunsByDepartment(runs, [], agents)).toEqual({ dev: MAX_ORBITERS });
  });
});
