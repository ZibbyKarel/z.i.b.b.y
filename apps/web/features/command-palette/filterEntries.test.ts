import { describe, expect, it } from "vitest";
import type { CommandPaletteEntry } from "./types";
import { GROUP_CAP, GROUP_ORDER, groupAndFilterEntries, matchesQuery } from "./filterEntries";

function entry(overrides: Partial<CommandPaletteEntry> & { id: string }): CommandPaletteEntry {
  return {
    group: "departments",
    kind: "department",
    label: "Untitled",
    ...overrides,
  };
}

describe("matchesQuery", () => {
  it("matches everything on a blank query", () => {
    expect(matchesQuery("", entry({ id: "a", label: "Anything" }))).toBe(true);
    expect(matchesQuery("   ", entry({ id: "a", label: "Anything" }))).toBe(true);
  });

  it("matches a case-insensitive substring of the label", () => {
    expect(matchesQuery("dev", entry({ id: "a", label: "Development" }))).toBe(true);
    expect(matchesQuery("DEV", entry({ id: "a", label: "Development" }))).toBe(true);
    expect(matchesQuery("zzz", entry({ id: "a", label: "Development" }))).toBe(false);
  });

  it("also matches against meta", () => {
    expect(matchesQuery("dev", entry({ id: "a", label: "Alice", meta: "dev" }))).toBe(true);
  });
});

describe("groupAndFilterEntries", () => {
  it("buckets entries by group in GROUP_ORDER, dropping empty groups", () => {
    const entries: CommandPaletteEntry[] = [
      entry({ id: "d1", group: "departments", label: "Dev" }),
      entry({ id: "a1", group: "actions", kind: "action", label: "New task" }),
    ];
    const groups = groupAndFilterEntries(entries, "");
    expect(groups.map((g) => g.group)).toEqual(["actions", "departments"]);
  });

  it("filters within each group by the query", () => {
    const entries: CommandPaletteEntry[] = [
      entry({ id: "d1", group: "departments", label: "Development" }),
      entry({ id: "d2", group: "departments", label: "Sales" }),
    ];
    const groups = groupAndFilterEntries(entries, "dev");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries.map((e) => e.id)).toEqual(["d1"]);
  });

  it("caps each group at GROUP_CAP", () => {
    const entries: CommandPaletteEntry[] = Array.from({ length: GROUP_CAP + 5 }, (_, i) =>
      entry({ id: `t${i}`, group: "tasks", kind: "task", label: `Task ${i}` }),
    );
    const groups = groupAndFilterEntries(entries, "");
    expect(groups[0]?.entries).toHaveLength(GROUP_CAP);
  });

  it("respects GROUP_ORDER even when entries arrive out of order", () => {
    const entries: CommandPaletteEntry[] = [
      entry({ id: "g1", group: "gates", kind: "gate", label: "Floor" }),
      entry({ id: "s1", group: "settings", kind: "setting", label: "General" }),
      entry({ id: "p1", group: "people", kind: "person", label: "Alice" }),
    ];
    const groups = groupAndFilterEntries(entries, "");
    expect(groups.map((g) => g.group)).toEqual(
      GROUP_ORDER.filter((g) => ["gates", "settings", "people"].includes(g)),
    );
  });
});
