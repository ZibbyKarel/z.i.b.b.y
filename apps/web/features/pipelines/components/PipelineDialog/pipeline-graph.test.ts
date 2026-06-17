import { describe, expect, it } from "vitest";
import { type Agent, CreatePipelineSchema } from "@zibby/contracts";
import type { Pipeline } from "../../../../domain";
import {
  INITIAL_ASSIGNMENT,
  type PipelineGraph,
  graphToPhases,
  isUpstreamRework,
  orderNodes,
  phasesToGraph,
  validateGraph,
} from "./pipeline-graph";

const agents: Agent[] = [
  { id: "writer", name: "Writer", glyph: "edit", model: "opus", thinking: "high", instructions: "w" },
  { id: "tester", name: "Tester", glyph: "flask", instructions: "t" },
];

const existing: Pipeline = {
  id: "delivery",
  name: "Delivery",
  lastRun: "—",
  lastState: "done",
  desc: "build → verify",
  file: "f",
  outputs: [],
  phases: [
    {
      id: "koder",
      type: "agent",
      agent: "writer",
      consumes: "task.md",
      produces: "implementation.md",
      model: "sonnet",
      thinking: "medium",
    },
    {
      id: "verify",
      type: "verify",
      commands: ["pnpm test"],
      loop: { to: "koder", maxRetries: 2, escalate: true, then: "fail" },
    },
  ],
};

/** A two-node agent→agent graph used by several cases. */
function chainGraph(): PipelineGraph {
  return {
    nodes: [
      { id: "a", type: "agent", agent: "writer", produces: "a.md", commands: "", model: "opus", thinking: "high", x: 0, y: 0 },
      { id: "b", type: "agent", agent: "tester", produces: "b.md", commands: "", model: "sonnet", thinking: "low", x: 300, y: 0 },
    ],
    flow: [{ id: "e1", from: "a", to: "b" }],
    rework: [],
  };
}

describe("phasesToGraph (auto-layout)", () => {
  it("returns an empty graph for a new pipeline", () => {
    expect(phasesToGraph(undefined, agents)).toEqual({ nodes: [], flow: [], rework: [] });
  });

  it("lays nodes left-to-right, one flow edge per consecutive pair", () => {
    const g = phasesToGraph(existing, agents);
    expect(g.nodes.map((n) => n.id)).toEqual(["koder", "verify"]);
    expect(g.nodes[0]!.x).toBeLessThan(g.nodes[1]!.x);
    expect(g.flow).toEqual([expect.objectContaining({ from: "koder", to: "verify" })]);
  });

  it("turns a phase loop into a rework edge to the loop.to phase", () => {
    const g = phasesToGraph(existing, agents);
    expect(g.rework).toHaveLength(1);
    expect(g.rework[0]).toMatchObject({ from: "verify", to: "koder", maxRetries: 2, escalate: true, then: "fail" });
  });
});

describe("orderNodes", () => {
  it("walks the flow chain from the head", () => {
    expect(orderNodes(chainGraph()).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("appends orphan nodes (no incoming/outgoing) deterministically", () => {
    const g = chainGraph();
    g.nodes.push({ id: "orphan", type: "agent", agent: "tester", produces: "o.md", commands: "", model: "opus", thinking: "high", x: 0, y: 0 });
    expect(orderNodes(g).map((n) => n.id)).toEqual(["a", "b", "orphan"]);
  });
});

describe("graphToPhases", () => {
  it("threads consumes from the previous node's produces; head consumes the assignment", () => {
    const phases = graphToPhases(chainGraph(), INITIAL_ASSIGNMENT);
    expect(phases[0]).toMatchObject({ id: "a", consumes: "task.md", produces: "a.md" });
    expect(phases[1]).toMatchObject({ id: "b", consumes: "a.md", produces: "b.md" });
  });

  it("round-trips an existing pipeline back to a schema-valid, equivalent phases[]", () => {
    const g = phasesToGraph(existing, agents);
    const phases = graphToPhases(g, existing.phases[0]!.consumes!);
    expect(phases[0]).toMatchObject({ id: "koder", agent: "writer", consumes: "task.md", produces: "implementation.md" });
    expect(phases[1]).toMatchObject({ id: "verify", type: "verify", commands: ["pnpm test"], loop: { to: "koder", maxRetries: 2, escalate: true, then: "fail" } });
    const input = { id: "delivery", name: "Delivery", desc: "d", instructions: "d", outputs: [], phases };
    expect(CreatePipelineSchema.safeParse(input).success).toBe(true);
  });

  it("emits commands only when present and omits loop when there is no rework", () => {
    const phases = graphToPhases(chainGraph(), INITIAL_ASSIGNMENT);
    expect(phases[0]).not.toHaveProperty("loop");
    expect(phases[1]).not.toHaveProperty("loop");
  });

  it("threads consumes THROUGH a mid-chain verify (agent→verify→agent)", () => {
    const pipeline: Pipeline = {
      ...existing,
      phases: [
        { id: "a1", type: "agent", agent: "writer", consumes: "task.md", produces: "draft.md", model: "opus", thinking: "high" },
        { id: "v", type: "verify", commands: ["pnpm test"] },
        { id: "a2", type: "agent", agent: "tester", consumes: "draft.md", produces: "final.md", model: "sonnet", thinking: "low" },
      ],
    };
    const phases = graphToPhases(phasesToGraph(pipeline, agents), "task.md");
    // The post-verify agent still consumes the pre-verify agent's output.
    expect(phases[2]).toMatchObject({ id: "a2", consumes: "draft.md" });
  });

  it("preserves a loop.to:'fail' across a round-trip (loose loop, not droppable)", () => {
    const pipeline: Pipeline = {
      ...existing,
      phases: [
        { id: "a1", type: "agent", agent: "writer", consumes: "task.md", produces: "draft.md", model: "opus", thinking: "high" },
        { id: "v", type: "verify", commands: ["pnpm test"], loop: { to: "fail", maxRetries: 1, escalate: false, then: "fail" } },
      ],
    };
    const phases = graphToPhases(phasesToGraph(pipeline, agents), "task.md");
    expect(phases[1]?.loop).toEqual({ to: "fail", maxRetries: 1, escalate: false, then: "fail" });
  });
});

describe("validateGraph", () => {
  it("rejects an empty name", () => {
    expect(validateGraph(chainGraph(), "  ")).toEqual({ ok: false, reason: "name" });
  });

  it("rejects an empty canvas", () => {
    expect(validateGraph({ nodes: [], flow: [], rework: [] }, "X")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects an agent node with no produces", () => {
    const g = chainGraph();
    g.nodes[1]!.produces = "";
    expect(validateGraph(g, "X")).toEqual({ ok: false, reason: "produces" });
  });

  it("accepts a valid upstream rework", () => {
    const g = chainGraph();
    g.rework.push({ id: "w1", from: "b", to: "a", maxRetries: 3, escalate: true, then: "park", escalation: [] });
    expect(validateGraph(g, "X")).toEqual({ ok: true });
  });

  it("rejects a forward (downstream) rework target", () => {
    const g = chainGraph();
    g.rework.push({ id: "w1", from: "a", to: "b", maxRetries: 3, escalate: true, then: "park", escalation: [] });
    expect(validateGraph(g, "X")).toEqual({ ok: false, reason: "rework" });
  });
});

describe("isUpstreamRework", () => {
  it("is true only when the target is earlier in the flow order", () => {
    const g = chainGraph();
    expect(isUpstreamRework(g, "b", "a")).toBe(true);
    expect(isUpstreamRework(g, "a", "b")).toBe(false);
    expect(isUpstreamRework(g, "a", "a")).toBe(false);
  });
});
