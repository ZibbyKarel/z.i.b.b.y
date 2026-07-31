import { describe, expect, it } from "vitest";
import { formatInventory, rankCandidates } from "./inventory.mjs";

describe("rankCandidates", () => {
  const regions = [
    {
      selector: ".card",
      tag: "div",
      classes: ["card"],
      text: "",
      box: { x: 0, y: 0, w: 400, h: 300 },
    },
    {
      selector: ".row",
      tag: "div",
      classes: ["row"],
      text: "Jméno",
      box: { x: 0, y: 0, w: 200, h: 40 },
    },
    {
      selector: "form",
      tag: "form",
      classes: ["form"],
      text: "",
      box: { x: 0, y: 0, w: 380, h: 260 },
    },
  ];

  it("ranks by class-name match first, beating a larger non-matching region", () => {
    expect(rankCandidates(regions, "row").map((r) => r.selector)).toEqual([
      ".row",
      ".card",
      "form",
    ]);
  });

  it("ranks by tag-name match too, beating a larger non-matching region", () => {
    expect(rankCandidates(regions, "form").map((r) => r.selector)).toEqual([
      "form",
      ".card",
      ".row",
    ]);
  });

  it("matches on text content too", () => {
    expect(rankCandidates(regions, "jméno").map((r) => r.selector)).toEqual([
      ".row",
      ".card",
      "form",
    ]);
  });

  it("falls back to the largest region when nothing matches", () => {
    expect(rankCandidates(regions, "naprosto nesouvisející").map((r) => r.selector)).toEqual([
      ".card",
      "form",
      ".row",
    ]);
  });
});

describe("formatInventory", () => {
  const regions = [
    {
      selector: ".foo",
      tag: "div",
      classes: ["foo"],
      text: "",
      box: { x: 10, y: 20, w: 100, h: 50 },
    },
    {
      selector: "#bar",
      tag: "div",
      classes: [],
      text: "",
      box: { x: 5, y: 5, w: 200, h: 75 },
    },
    {
      selector: "form.form:nth-child(3)",
      tag: "form",
      classes: ["form"],
      text: "",
      box: { x: 1, y: 2, w: 380, h: 260 },
    },
  ];

  it("pins the exact full string, header, numbering, padding and rN.png suffix", () => {
    expect(formatInventory(regions.slice(0, 2))).toBe(
      "Inventura regionů (1440×900):\n" +
        "  [1] .foo                        100×50 @ (10,20)   ▸ r1.png\n" +
        "  [2] #bar                        200×75 @ (5,5)   ▸ r2.png",
    );
  });

  it("carries the same number in the [n] label and the rN.png filename on every line", () => {
    const lines = formatInventory(regions).split("\n").slice(1);
    lines.forEach((line, index) => {
      expect(line).toContain(`[${index + 1}]`);
      expect(line).toContain(`▸ r${index + 1}.png`);
    });
  });

  it("limit truncates the list", () => {
    expect(formatInventory(regions, 1)).toBe(
      "Inventura regionů (1440×900):\n" +
        "  [1] .foo                        100×50 @ (10,20)   ▸ r1.png",
    );
  });

  it("returns the header line alone for an empty array", () => {
    expect(formatInventory([])).toBe("Inventura regionů (1440×900):");
  });
});
