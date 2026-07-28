import type { RoadmapItem } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import {
  BOARD_COLUMNS,
  blockersOf,
  buildRoadmapLookup,
  dependentsOf,
  epicHue,
  epicProgress,
  epicStatus,
  groupByColumn,
  stripMarkdownPreview,
} from "./roadmap-board";

function item(partial: Partial<RoadmapItem> & Pick<RoadmapItem, "id">): RoadmapItem {
  return {
    projectId: "proj-1",
    level: "task",
    name: partial.id,
    description: "",
    source: { kind: "manual" },
    attachments: [],
    dependsOn: [],
    dependsOnFromSource: [],
    lifecycle: "todo",
    runs: [],
    syncNotes: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

describe("buildRoadmapLookup", () => {
  it("resolves items by id and returns undefined for an unknown id", () => {
    const get = buildRoadmapLookup([item({ id: "a" }), item({ id: "b" })]);
    expect(get("a")?.id).toBe("a");
    expect(get("missing")).toBeUndefined();
  });
});

describe("epicProgress", () => {
  it("counts done/total, excluding archived children", () => {
    const items = [
      item({ id: "e1", level: "epic" }),
      item({ id: "t1", parentId: "e1", lifecycle: "done" }),
      item({ id: "t2", parentId: "e1", lifecycle: "todo" }),
      item({ id: "t3", parentId: "e1", lifecycle: "archived" }),
    ];
    expect(epicProgress(items, "e1")).toEqual({ done: 1, total: 2 });
  });

  it("reports zero/zero for a childless epic", () => {
    const items = [item({ id: "e1", level: "epic" })];
    expect(epicProgress(items, "e1")).toEqual({ done: 0, total: 0 });
  });
});

describe("epicStatus", () => {
  it("is idea when the epic has no (non-archived) children", () => {
    const items = [
      item({ id: "e1", level: "epic" }),
      item({ id: "t1", parentId: "e1", lifecycle: "archived" }),
    ];
    const get = buildRoadmapLookup(items);
    expect(epicStatus(items, "e1", get)).toBe("idea");
  });

  it("is done when every child is done", () => {
    const items = [
      item({ id: "e1", level: "epic" }),
      item({ id: "t1", parentId: "e1", lifecycle: "done" }),
      item({ id: "t2", parentId: "e1", lifecycle: "done" }),
    ];
    const get = buildRoadmapLookup(items);
    expect(epicStatus(items, "e1", get)).toBe("done");
  });

  it("is blocked when any child is blocked, even if others are done", () => {
    const items = [
      item({ id: "e1", level: "epic" }),
      item({ id: "t1", parentId: "e1", lifecycle: "done" }),
      item({ id: "t2", parentId: "e1", lifecycle: "todo", dependsOn: ["t1", "ghost"] }),
    ];
    const get = buildRoadmapLookup(items);
    // t2 depends on "ghost", which never resolves -> isBlocked -> "blocked".
    expect(epicStatus(items, "e1", get)).toBe("blocked");
  });

  it("is active once something has started, todo when nothing has", () => {
    const notStarted = [
      item({ id: "e1", level: "epic" }),
      item({ id: "t1", parentId: "e1", lifecycle: "todo" }),
    ];
    const started = [
      item({ id: "e2", level: "epic" }),
      item({ id: "t2", parentId: "e2", lifecycle: "running" }),
    ];
    expect(epicStatus(notStarted, "e1", buildRoadmapLookup(notStarted))).toBe("todo");
    expect(epicStatus(started, "e2", buildRoadmapLookup(started))).toBe("active");
  });
});

describe("groupByColumn", () => {
  it("sorts children into the four columns and drops archived entirely", () => {
    const blocker = item({ id: "blocker", lifecycle: "todo" });
    const items = [
      blocker,
      item({ id: "blocked", dependsOn: ["blocker"] }),
      item({ id: "ready", lifecycle: "failed" }),
      item({ id: "running", lifecycle: "running" }),
      item({ id: "done", lifecycle: "done" }),
      item({ id: "gone", lifecycle: "archived" }),
    ];
    const get = buildRoadmapLookup(items);
    const children = items.filter((i) => i.id !== "gone" || true); // include archived on purpose
    const groups = groupByColumn(children, get);

    expect(groups.blocked.map((i) => i.id)).toEqual(["blocked"]);
    expect(groups.ready.map((i) => i.id).sort()).toEqual(["blocker", "ready"]);
    expect(groups["in-progress"].map((i) => i.id)).toEqual(["running"]);
    expect(groups.done.map((i) => i.id)).toEqual(["done"]);

    const allRendered = [
      ...groups.blocked,
      ...groups.ready,
      ...groups["in-progress"],
      ...groups.done,
    ];
    expect(allRendered.some((i) => i.id === "gone")).toBe(false);
  });

  it("BOARD_COLUMNS is BLOKOVANÉ-first and never lists archived", () => {
    expect(BOARD_COLUMNS).toEqual(["blocked", "ready", "in-progress", "done"]);
  });
});

describe("blockersOf / dependentsOf", () => {
  const items = [
    item({ id: "a" }),
    item({ id: "b", dependsOn: ["a", "dangling"] }),
    item({ id: "c", dependsOn: ["a"] }),
  ];

  it("resolves blockers and drops dangling ids", () => {
    const get = buildRoadmapLookup(items);
    const b = items.find((i) => i.id === "b")!;
    expect(blockersOf(b, get).map((i) => i.id)).toEqual(["a"]);
  });

  it("finds every project item that depends on this one", () => {
    const a = items.find((i) => i.id === "a")!;
    expect(
      dependentsOf(a, items)
        .map((i) => i.id)
        .sort(),
    ).toEqual(["b", "c"]);
  });
});

describe("epicHue", () => {
  it("is deterministic for the same id", () => {
    expect(epicHue("epic-1")).toBe(epicHue("epic-1"));
  });

  it("differs for different ids (in the general case)", () => {
    expect(epicHue("epic-1")).not.toBe(epicHue("epic-2"));
  });
});

describe("stripMarkdownPreview", () => {
  it("strips headings, emphasis and link syntax, keeping link text", () => {
    expect(stripMarkdownPreview("# Title\n\nSome **bold** and _em_ and [a link](https://x)")).toBe(
      "Title Some bold and em and a link",
    );
  });

  it("collapses newlines to spaces", () => {
    expect(stripMarkdownPreview("line one\nline two")).toBe("line one line two");
  });
});
