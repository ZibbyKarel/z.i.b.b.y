import { describe, expect, it } from "vitest";
import type { MemoryGraph } from "@zibby/contracts";
import { filterGraphByProject, filterGraphByTier } from "./filterGraph";

const graph: MemoryGraph = {
  nodes: [
    { id: "MEMORY", label: "Memory", tier: "memory" },
    { id: "rohlik", label: "Rohlik", tier: "knowledge" },
    { id: "2026-06-12", label: "2026-06-12", tier: "daily" },
  ],
  edges: [
    { from: "MEMORY", to: "rohlik" },
    { from: "2026-06-12", to: "rohlik" },
  ],
};

describe("filterGraphByTier", () => {
  it("returns the graph unchanged for 'all'", () => {
    expect(filterGraphByTier(graph, "all")).toBe(graph);
  });

  it("keeps only the tier's nodes", () => {
    const out = filterGraphByTier(graph, "knowledge");
    expect(out.nodes.map((n) => n.id)).toEqual(["rohlik"]);
  });

  it("drops edges whose endpoint was filtered out", () => {
    // Filtering to 'knowledge' removes MEMORY and the daily node, so both edges
    // (each has a non-knowledge endpoint) must go too.
    const out = filterGraphByTier(graph, "knowledge");
    expect(out.edges).toEqual([]);
  });

  it("keeps an edge only when BOTH endpoints survive", () => {
    const connected: MemoryGraph = {
      nodes: [
        { id: "a", label: "A", tier: "knowledge" },
        { id: "b", label: "B", tier: "knowledge" },
        { id: "c", label: "C", tier: "memory" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
      ],
    };
    const out = filterGraphByTier(connected, "knowledge");
    expect(out.edges).toEqual([{ from: "a", to: "b" }]);
  });
});

describe("filterGraphByProject", () => {
  const projectGraph: MemoryGraph = {
    nodes: [
      { id: "alpha-note", label: "Alpha", tier: "knowledge", project: "alpha" },
      { id: "beta-note", label: "Beta", tier: "knowledge", project: "beta" },
      { id: "global", label: "Global", tier: "memory" },
    ],
    edges: [
      { from: "alpha-note", to: "global" },
      { from: "alpha-note", to: "beta-note" },
    ],
  };

  it("keeps only unattributed notes for null (Bez projektu)", () => {
    const out = filterGraphByProject(projectGraph, null);
    expect(out.nodes.map((n) => n.id)).toEqual(["global"]);
  });

  it("keeps only nodes attributed to the project — global notes drop too", () => {
    const out = filterGraphByProject(projectGraph, "alpha");
    expect(out.nodes.map((n) => n.id)).toEqual(["alpha-note"]);
  });

  it("drops edges whose endpoint was filtered out", () => {
    const out = filterGraphByProject(projectGraph, "alpha");
    expect(out.edges).toEqual([]);
  });
});
