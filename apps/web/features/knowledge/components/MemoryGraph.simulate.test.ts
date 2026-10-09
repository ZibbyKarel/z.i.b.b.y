import { describe, expect, it } from "vitest";
import type { MemoryGraph } from "@zibby/contracts";
import { simulate } from "./MemoryGraph";

const WIDTH = 560;
const HEIGHT = 420;

const allFinite = (pos: Array<{ x: number; y: number }>) =>
  pos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

const inViewport = (pos: Array<{ x: number; y: number }>) =>
  pos.every((p) => p.x >= 24 && p.x <= WIDTH - 24 && p.y >= 24 && p.y <= HEIGHT - 24);

describe("simulate", () => {
  it("returns no positions for an empty graph", () => {
    expect(simulate({ nodes: [], edges: [] })).toEqual([]);
  });

  it("keeps positions finite and on-canvas for a bidirectional edge pair", () => {
    // Regression: two notes that wiki-link each other produce A→B and B→A edges.
    // The old spring applied displacement along the raw (dx, dy), so a long edge
    // overshot the far node and the layout diverged to ±Infinity → NaN, collapsing
    // every node onto the origin (invisible graph). It must now stay finite.
    const graph: MemoryGraph = {
      nodes: [
        { id: "2026-06-12", label: "2026-06-12", tier: "daily" },
        { id: "zibby-index", label: "ZIBBY Index", tier: "knowledge" },
        { id: "north-star", label: "North Star", tier: "memory" },
      ],
      edges: [
        { from: "zibby-index", to: "north-star" },
        { from: "north-star", to: "zibby-index" },
      ],
    };
    const pos = simulate(graph);
    expect(pos).toHaveLength(3);
    expect(allFinite(pos)).toBe(true);
    expect(inViewport(pos)).toBe(true);
  });

  it("spreads connected nodes apart rather than stacking them", () => {
    const graph: MemoryGraph = {
      nodes: [
        { id: "a", label: "A", tier: "memory" },
        { id: "b", label: "B", tier: "knowledge" },
        { id: "c", label: "C", tier: "daily" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };
    const pos = simulate(graph);
    expect(allFinite(pos)).toBe(true);
    // No two nodes land on the same point.
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i]!;
        const b = pos[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
      }
    }
  });

  it("is deterministic for a given graph", () => {
    const graph: MemoryGraph = {
      nodes: [
        { id: "a", label: "A", tier: "memory" },
        { id: "b", label: "B", tier: "knowledge" },
      ],
      edges: [{ from: "a", to: "b" }],
    };
    expect(simulate(graph)).toEqual(simulate(graph));
  });
});
