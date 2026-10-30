import { describe, expect, it } from "vitest";
import {
  type BridgeWidget,
  addWidget,
  compact,
  dragMove,
  dragResize,
  fromArr,
  removeWidget,
  stackLayout,
  toCells,
  viewLayout,
} from "./layout";
import { DEFAULT_LAYOUT } from "./presets";

const get = (l: BridgeWidget[], id: string): BridgeWidget => {
  const f = l.find((i) => i.id === id);
  if (!f) throw new Error(id);
  return f;
};

describe("compact", () => {
  it("is a fixed point on DEFAULT", () => {
    expect(compact(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT);
  });
  it("drops overlapping widgets below", () => {
    const l = compact(
      fromArr([
        ["issues", 0, 0, 4, 5],
        ["prs", 2, 0, 4, 5],
      ]),
    );
    expect(get(l, "issues").y).toBe(0);
    expect(get(l, "prs").y).toBe(5);
  });
  it("pulls floating widgets up to y=0", () => {
    expect(get(compact(fromArr([["tasks", 0, 9, 4, 3]])), "tasks").y).toBe(0);
  });
  it("priority keeps its y, others yield", () => {
    const l = compact(
      fromArr([
        ["issues", 0, 0, 4, 5],
        ["prs", 0, 3, 4, 5],
      ]),
      "prs",
    );
    expect(get(l, "prs").y).toBe(3);
    expect(get(l, "issues").y).toBe(8); // first free row below priority 3..8
    const l2 = compact(
      fromArr([
        ["issues", 0, 0, 4, 5],
        ["prs", 0, 0, 4, 5],
      ]),
      "prs",
    );
    expect(get(l2, "prs").y).toBe(0);
    expect(get(l2, "issues").y).toBe(5);
  });
  it("does not mutate input", () => {
    const input = fromArr([["prs", 0, 7, 4, 3]]);
    compact(input);
    expect(input[0]?.y).toBe(7);
  });
});

describe("drag", () => {
  const origin = { x: 4, y: 3, w: 4, h: 18 };
  it("move clamps x and y", () => {
    const m = dragMove(DEFAULT_LAYOUT, "prs", origin, 99, -99);
    expect(get(m, "prs").x).toBe(8);
    expect(get(m, "prs").y).toBe(0);
    expect(get(dragMove(DEFAULT_LAYOUT, "prs", origin, -99, 0), "prs").x).toBe(0);
  });
  it("move onto another widget pushes it down", () => {
    const m = dragMove(DEFAULT_LAYOUT, "prs", origin, -4, 0);
    expect(get(m, "prs")).toMatchObject({ x: 0, y: 3 });
    expect(get(m, "issues").y).toBe(21);
  });
  it("resize clamps min 2x2 and to board edge", () => {
    const small = dragResize(DEFAULT_LAYOUT, "prs", origin, -99, -99);
    expect(get(small, "prs")).toMatchObject({ w: 2, h: 2 });
    const big = dragResize(DEFAULT_LAYOUT, "prs", origin, 99, 1);
    expect(get(big, "prs")).toMatchObject({ w: 8, h: 19 });
  });
});

describe("dragResize corners", () => {
  const solo = fromArr([["prs", 4, 4, 4, 4]]);
  const o = { x: 4, y: 4, w: 4, h: 4 };
  const run = (dx: number, dy: number, c: "nw" | "ne" | "sw" | "se") =>
    get(dragResize(solo, "prs", o, dx, dy, c), "prs");
  it.each([
    ["se", 1, 1, { x: 4, y: 4, w: 5, h: 5 }],
    ["sw", -2, 1, { x: 2, y: 4, w: 6, h: 5 }],
    ["ne", 1, -2, { x: 4, y: 2, w: 5, h: 6 }],
    ["nw", -1, -1, { x: 3, y: 3, w: 5, h: 5 }],
    ["nw", 5, 5, { x: 6, y: 6, w: 2, h: 2 }],
    ["sw", -10, 0, { x: 0, w: 8 }],
    ["nw", 0, -10, { y: 0, h: 8 }],
  ] as const)("%s (%i,%i)", (c, dx, dy, want) => {
    expect(run(dx, dy, c)).toMatchObject(want);
  });
});

describe("toCells", () => {
  it("rounds to whole cells", () => {
    expect(toCells(110, -30, 80, 10, 20)).toEqual({ dx: 1, dy: -1 });
    expect(toCells(44, 14, 80, 10, 20)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("add/remove/view", () => {
  it("addWidget places 4x6 at first free spot", () => {
    const l = addWidget(fromArr([["issues", 0, 0, 4, 5]]), "runs");
    expect(get(l, "runs")).toMatchObject({ x: 0, y: 5, w: 4, h: 6 });
  });
  it("removeWidget compacts", () => {
    const l = removeWidget(
      fromArr([
        ["issues", 0, 0, 4, 5],
        ["prs", 0, 5, 4, 5],
      ]),
      "issues",
    );
    expect(l).toHaveLength(1);
    expect(get(l, "prs").y).toBe(0);
  });
  it("viewLayout shrinks widgets and moves neighbours up", () => {
    const l = viewLayout(DEFAULT_LAYOUT, new Set(["tasks"]));
    expect(get(l, "tasks").h).toBe(1);
    expect(get(l, "runs").y).toBe(4);
    expect(get(DEFAULT_LAYOUT, "tasks").h).toBe(10);
  });
});

describe("stackLayout", () => {
  it("stacks widgets full width in reading order, keeping each height", () => {
    const l = fromArr([
      ["prs", 6, 0, 6, 4],
      ["runs", 0, 0, 6, 3],
      ["todo", 0, 3, 12, 2],
    ]);
    expect(stackLayout(l).map(({ id, x, y, w, h }) => [id, x, y, w, h])).toEqual([
      ["runs", 0, 0, 12, 3],
      ["prs", 0, 3, 12, 4],
      ["todo", 0, 7, 12, 2],
    ]);
  });
});
