import type { Agent } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import type { Pipeline } from "../../../../domain";
import type { RunView } from "../../../runs/run";
import {
  MAX_PARTICLES,
  appendParticle,
  flightForEvent,
  hashJitter,
  particleDuration,
  resolveEventOwner,
} from "./particle-mapping";

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

describe("resolveEventOwner", () => {
  it("resolves a pipeline-runs event to the pipeline's ownerSubsystem", () => {
    const owner = resolveEventOwner(
      { scope: "pipeline-runs", runId: "delivery_1" },
      [run()],
      [pipeline({ ownerSubsystem: "forge" })],
      [],
    );
    expect(owner).toBe("forge");
  });

  it("returns undefined for a scope with no ownerSubsystem path (goal-runs, channel-items, activity)", () => {
    for (const scope of ["goal-runs", "channel-items", "activity"] as const) {
      expect(
        resolveEventOwner(
          { scope, runId: "delivery_1" },
          [run()],
          [pipeline({ ownerSubsystem: "forge" })],
          [],
        ),
      ).toBeUndefined();
    }
  });

  it("a goal-runs event never resolves an owner, even when the id happens to match an owned run (D16)", () => {
    const owner = resolveEventOwner(
      { scope: "goal-runs", runId: "delivery_1" },
      [run()],
      [pipeline({ ownerSubsystem: "forge" })],
      [],
    );
    expect(owner).toBeUndefined();
  });

  it("returns undefined when the run isn't (yet) in the runs cache — the honest race", () => {
    const owner = resolveEventOwner(
      { scope: "pipeline-runs", runId: "brand-new_1" },
      [run()],
      [pipeline({ ownerSubsystem: "forge" })],
      [],
    );
    expect(owner).toBeUndefined();
  });

  it("returns undefined when the pipeline has no ownerSubsystem tag", () => {
    const owner = resolveEventOwner(
      { scope: "pipeline-runs", runId: "delivery_1" },
      [run()],
      [pipeline()],
      [],
    );
    expect(owner).toBeUndefined();
  });

  it("returns undefined when runId is missing", () => {
    expect(
      resolveEventOwner(
        { scope: "pipeline-runs" },
        [run()],
        [pipeline({ ownerSubsystem: "forge" })],
        [],
      ),
    ).toBeUndefined();
  });

  it("resolves an agent-kind run symmetrically, against the agent's ownerSubsystem", () => {
    const owner = resolveEventOwner(
      { scope: "pipeline-runs", runId: "koder_1" },
      [run({ runId: "koder_1", kind: "agent", owner: "koder" })],
      [],
      [agent({ ownerSubsystem: "forge" })],
    );
    expect(owner).toBe("forge");
  });

  it("resolves a REAL agent-runs SSE event to the owning agent's ownerSubsystem", () => {
    const owner = resolveEventOwner(
      { scope: "agent-runs", runId: "koder_1" },
      [run({ runId: "koder_1", kind: "agent", owner: "koder" })],
      [],
      [agent({ ownerSubsystem: "forge" })],
    );
    expect(owner).toBe("forge");
  });

  it("returns undefined when the owning agent has no ownerSubsystem tag", () => {
    const owner = resolveEventOwner(
      { scope: "pipeline-runs", runId: "koder_1" },
      [run({ runId: "koder_1", kind: "agent", owner: "koder" })],
      [],
      [agent()],
    );
    expect(owner).toBeUndefined();
  });
});

describe("flightForEvent", () => {
  const runs = [run()];
  const pipelines = [pipeline({ ownerSubsystem: "forge" })];

  it("'running' → dispatch, center to node", () => {
    const flight = flightForEvent(
      { scope: "pipeline-runs", runId: "delivery_1", status: "running" },
      runs,
      pipelines,
      [],
    );
    expect(flight).toEqual({ from: "orb", to: "forge", subsystemId: "forge" });
  });

  it.each(["done", "failed", "parked"])("'%s' → report, node to center", (status) => {
    const flight = flightForEvent(
      { scope: "pipeline-runs", runId: "delivery_1", status },
      runs,
      pipelines,
      [],
    );
    expect(flight).toEqual({ from: "forge", to: "orb", subsystemId: "forge" });
  });

  it.each(["paused-limit", "interrupted"])(
    "'%s' produces no flight (not a start or a report)",
    (status) => {
      const flight = flightForEvent(
        { scope: "pipeline-runs", runId: "delivery_1", status },
        runs,
        pipelines,
        [],
      );
      expect(flight).toBeUndefined();
    },
  );

  it("an unattributable owner produces no flight regardless of status", () => {
    const flight = flightForEvent(
      { scope: "pipeline-runs", runId: "unknown_1", status: "running" },
      runs,
      pipelines,
      [],
    );
    expect(flight).toBeUndefined();
  });

  it("a scope with no owner path (goal-runs) never produces a flight", () => {
    const flight = flightForEvent(
      { scope: "goal-runs", runId: "writer_1", status: "running" },
      runs,
      pipelines,
      [],
    );
    expect(flight).toBeUndefined();
  });

  describe("agent-runs — comms travel both directions for agent-kind runs too", () => {
    const agentRuns = [run({ runId: "koder_1", kind: "agent", owner: "koder" })];
    const agentCatalog = [agent({ ownerSubsystem: "forge" })];

    it("'running' → dispatch, center to node", () => {
      const flight = flightForEvent(
        { scope: "agent-runs", runId: "koder_1", status: "running" },
        agentRuns,
        [],
        agentCatalog,
      );
      expect(flight).toEqual({ from: "orb", to: "forge", subsystemId: "forge" });
    });

    it.each(["done", "error", "awaiting-approval"])("'%s' → report, node to center", (status) => {
      const flight = flightForEvent(
        { scope: "agent-runs", runId: "koder_1", status },
        agentRuns,
        [],
        agentCatalog,
      );
      expect(flight).toEqual({ from: "forge", to: "orb", subsystemId: "forge" });
    });

    it.each(["paused-limit", "interrupted"])(
      "'%s' produces no flight (not a start or a report)",
      (status) => {
        const flight = flightForEvent(
          { scope: "agent-runs", runId: "koder_1", status },
          agentRuns,
          [],
          agentCatalog,
        );
        expect(flight).toBeUndefined();
      },
    );
  });
});

describe("appendParticle", () => {
  it("appends under the cap", () => {
    const list = appendParticle([1, 2, 3], 4);
    expect(list).toEqual([1, 2, 3, 4]);
  });

  it("drops the OLDEST entries once over MAX_PARTICLES, never the newest", () => {
    const full = Array.from({ length: MAX_PARTICLES }, (_, i) => i);
    const next = appendParticle(full, MAX_PARTICLES);
    expect(next).toHaveLength(MAX_PARTICLES);
    expect(next[0]).toBe(1); // oldest (0) dropped
    expect(next.at(-1)).toBe(MAX_PARTICLES); // newest kept
  });
});

describe("hashJitter", () => {
  it("is deterministic — same seed, same output, every call", () => {
    expect(hashJitter("delivery_1:running")).toBe(hashJitter("delivery_1:running"));
  });

  it("stays within [0, 1)", () => {
    for (const seed of ["a", "delivery_1:done:0", "very-long-run-id-string-42"]) {
      const v = hashJitter(seed);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("differs across distinct seeds (not a constant)", () => {
    expect(hashJitter("a")).not.toBe(hashJitter("b"));
  });
});

describe("particleDuration", () => {
  it("stays within the phase-97-raised 1.5–2.3s flight range", () => {
    for (const seed of ["a", "b", "delivery_1:running:0", "zzz"]) {
      const d = particleDuration(seed);
      expect(d).toBeGreaterThanOrEqual(1.5);
      expect(d).toBeLessThan(2.3);
    }
  });

  it("is deterministic — same seed, same duration", () => {
    expect(particleDuration("delivery_1:done:3")).toBe(particleDuration("delivery_1:done:3"));
  });
});
