import { describe, expect, it } from "vitest";
import type { MemoryGraph } from "@zibby/contracts";
import { groupVaultNodes } from "./groupVault";

const nodes: MemoryGraph["nodes"] = [
  { id: "moc", label: "MOC", tier: "memory" },
  { id: "dev-moc", label: "Dev shelf", tier: "knowledge", department: "dev" },
  { id: "qa-moc", label: "QA shelf", tier: "knowledge", department: "qa" },
  { id: "loose-note", label: "Loose note", tier: "knowledge" },
  { id: "2026-09-25", label: "2026-09-25", tier: "daily" },
];

describe("groupVaultNodes", () => {
  it("groups by tier, then by department shelf (general last)", () => {
    const groups = groupVaultNodes(nodes);
    expect(groups.map((g) => g.tier)).toEqual(["memory", "knowledge", "daily"]);

    const knowledge = groups.find((g) => g.tier === "knowledge")!;
    expect(knowledge.shelves.map((s) => s.department)).toEqual(["dev", "qa", null]);
    expect(knowledge.shelves[0]!.notes).toEqual([{ id: "dev-moc", label: "Dev shelf" }]);
  });

  it("drops tiers and shelves with nothing visible", () => {
    const groups = groupVaultNodes(nodes, new Set(["dev-moc"]));
    expect(groups).toEqual([
      {
        tier: "knowledge",
        shelves: [{ department: "dev", notes: [{ id: "dev-moc", label: "Dev shelf" }] }],
      },
    ]);
  });
});
