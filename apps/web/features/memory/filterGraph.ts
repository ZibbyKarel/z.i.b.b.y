import type { MemoryGraph, MemoryTier } from "@zibby/contracts";

/** The tier filter the memory screen applies — a real tier, or "all" (no filter). */
export type TierFilter = MemoryTier | "all";

/**
 * Filter a memory graph to one tier. Nodes not in the tier are dropped, and any
 * edge with a dropped endpoint goes with them (an edge to a hidden node would
 * dangle). `"all"` returns the graph unchanged. Pure — unit-tested directly.
 */
export function filterGraphByTier(graph: MemoryGraph, tier: TierFilter): MemoryGraph {
  if (tier === "all") return graph;
  const nodes = graph.nodes.filter((n) => n.tier === tier);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  return { nodes, edges };
}
