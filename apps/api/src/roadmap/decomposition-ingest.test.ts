import type { DecompositionArtifact, RoadmapItem } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { ingestDecomposition } from "./decomposition-ingest";

const NOW = "2026-07-28T00:00:00.000Z";

function epic(over: Partial<RoadmapItem> = {}): RoadmapItem {
  return {
    id: "epic-1",
    projectId: "acme",
    level: "epic",
    name: "Rollout za flagem",
    description: "Zapnout novou detekci",
    source: { kind: "manual" },
    attachments: [],
    dependsOn: [],
    dependsOnFromSource: [],
    lifecycle: "todo",
    runs: [],
    syncNotes: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("ingestDecomposition", () => {
  it("mints a child item per entry, parented to the epic, badged and inert", () => {
    const artifact: DecompositionArtifact = [
      { name: "Add schema", description: "…", dependsOn: [] },
    ];
    const { items, droppedEdges } = ingestDecomposition(artifact, epic(), NOW);

    expect(items).toHaveLength(1);
    expect(droppedEdges).toBe(0);
    expect(items[0]).toMatchObject({
      projectId: "acme",
      level: "task",
      parentId: "epic-1",
      name: "Add schema",
      description: "…",
      origin: "zibby-decomposed",
      lifecycle: "todo",
      runs: [],
      dependsOn: [],
    });
    expect(items[0]!.id).toBeTruthy();
  });

  it("resolves ordinal dependsOn to the freshly minted ids, in ordinal order", () => {
    const artifact: DecompositionArtifact = [
      { name: "Add schema", description: "", dependsOn: [] },
      { name: "Add endpoint", description: "", dependsOn: [0] },
      { name: "Wire UI", description: "", dependsOn: [0, 1] },
    ];
    const { items } = ingestDecomposition(artifact, epic(), NOW);

    const [schema, endpoint, ui] = items;
    expect(endpoint!.dependsOn).toEqual([schema!.id]);
    expect(ui!.dependsOn).toEqual([schema!.id, endpoint!.id]);
  });

  it("drops an out-of-range ordinal rather than throwing or keeping a dangling edge", () => {
    const artifact: DecompositionArtifact = [
      { name: "Only item", description: "", dependsOn: [5, -1] },
    ];
    const { items, droppedEdges } = ingestDecomposition(artifact, epic(), NOW);

    expect(items[0]!.dependsOn).toEqual([]);
    expect(droppedEdges).toBe(2);
  });

  it("drops a self-reference", () => {
    const artifact: DecompositionArtifact = [
      { name: "A", description: "", dependsOn: [] },
      { name: "B", description: "", dependsOn: [1] }, // its own ordinal
    ];
    const { items, droppedEdges } = ingestDecomposition(artifact, epic(), NOW);

    expect(items[1]!.dependsOn).toEqual([]);
    expect(droppedEdges).toBe(1);
  });

  it("dedupes a repeated ordinal within one entry's dependsOn", () => {
    const artifact: DecompositionArtifact = [
      { name: "A", description: "", dependsOn: [] },
      { name: "B", description: "", dependsOn: [0, 0, 0] },
    ];
    const { items, droppedEdges } = ingestDecomposition(artifact, epic(), NOW);

    expect(items[1]!.dependsOn).toEqual([items[0]!.id]);
    expect(droppedEdges).toBe(2);
  });

  it("handles an empty artifact — no items, nothing dropped", () => {
    const { items, droppedEdges } = ingestDecomposition([], epic(), NOW);
    expect(items).toEqual([]);
    expect(droppedEdges).toBe(0);
  });

  it("mints distinct ids even for two entries sharing the same name", () => {
    const artifact: DecompositionArtifact = [
      { name: "Duplicate name", description: "first", dependsOn: [] },
      { name: "Duplicate name", description: "second", dependsOn: [0] },
    ];
    const { items } = ingestDecomposition(artifact, epic(), NOW);

    expect(items[0]!.id).not.toBe(items[1]!.id);
    expect(items[1]!.dependsOn).toEqual([items[0]!.id]);
    expect(items[0]!.description).toBe("first");
    expect(items[1]!.description).toBe("second");
  });
});
