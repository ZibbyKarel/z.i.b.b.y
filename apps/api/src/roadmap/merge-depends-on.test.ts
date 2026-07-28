import { describe, expect, it } from "vitest";
import { mergeDependsOn } from "./merge-depends-on";

describe("mergeDependsOn", () => {
  it("preserves a manual edge across a re-sync that declares no source edges", () => {
    expect(mergeDependsOn(["manual-a"], [], [])).toEqual(["manual-a"]);
  });

  it("drops a source edge the source no longer declares", () => {
    expect(mergeDependsOn(["manual-a", "src-b"], ["src-b"], [])).toEqual(["manual-a"]);
  });

  it("picks up a brand new source edge", () => {
    expect(mergeDependsOn(["manual-a"], [], ["src-c"])).toEqual(["manual-a", "src-c"]);
  });

  it("does both at once: drops a removed source edge and adds a new one, preserving the manual edge", () => {
    expect(mergeDependsOn(["manual-a", "src-b"], ["src-b"], ["src-c"])).toEqual([
      "manual-a",
      "src-c",
    ]);
  });

  it("keeps an unchanged source edge without reordering or duplicating it", () => {
    expect(mergeDependsOn(["manual-a", "src-b"], ["src-b"], ["src-b"])).toEqual([
      "manual-a",
      "src-b",
    ]);
  });

  it("never touches an edge that was never in oldFromSource, even if it coincidentally equals a new source id", () => {
    // "manual-b" was hand-added by the operator (never source-owned); the
    // source now ALSO declares the very same id. It must not be duplicated,
    // and it must not be classified as droppable just because it matches a
    // source id.
    expect(mergeDependsOn(["manual-b"], [], ["manual-b"])).toEqual(["manual-b"]);
  });

  it("handles a from-scratch item with only source edges (nothing manual yet)", () => {
    expect(mergeDependsOn([], [], ["src-a", "src-b"])).toEqual(["src-a", "src-b"]);
  });

  it("drops every source edge when the source stops declaring any, with nothing manual to keep", () => {
    expect(mergeDependsOn(["src-a", "src-b"], ["src-a", "src-b"], [])).toEqual([]);
  });

  it("is a pure function: does not mutate any of its inputs", () => {
    const current = ["manual-a", "src-b"];
    const oldFromSource = ["src-b"];
    const newFromSource = ["src-c"];
    mergeDependsOn(current, oldFromSource, newFromSource);
    expect(current).toEqual(["manual-a", "src-b"]);
    expect(oldFromSource).toEqual(["src-b"]);
    expect(newFromSource).toEqual(["src-c"]);
  });
});
