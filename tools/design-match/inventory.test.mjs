import { describe, expect, it } from "vitest";
import { cropFitsPage, formatInventory, rankCandidates } from "./inventory.mjs";

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

  // D7's second cause on `ZIBBY Redesign Canvas.html`: a region that is not on
  // the full-page screenshot gets no crop, so the inventory must not print an
  // `rN.png` that was never written.
  it("says a region has no preview instead of naming a file that was not written", () => {
    const out = formatInventory(regions, 5, ["/tmp/x/r1.png", null, "/tmp/x/r3.png"]);
    const lines = out.split("\n").slice(1);
    expect(lines[0]).toContain("▸ r1.png");
    expect(lines[1]).not.toContain("r2.png");
    expect(lines[1]).toContain("bez náhledu");
    expect(lines[2]).toContain("▸ r3.png");
  });
});

/**
 * `page.screenshot({ fullPage: true })` yields an image the size of the
 * scrollable document, and a `clip` outside it is a hard Playwright error —
 * "Clipped area is either empty or outside the resulting image", the same
 * message D3 produced for a different reason. `ZIBBY Redesign Canvas.html` is a
 * pan/zoom canvas whose cards sit inside a transformed `overflow: hidden`
 * container, so their boxes are at y≈1200 and 4256px wide while the document
 * stays 1440×900. They are real elements; they are just not on the picture.
 */
describe("cropFitsPage", () => {
  const page = { width: 1440, height: 900 };

  it("accepts a region inside the page image", () => {
    expect(cropFitsPage({ x: 0, y: 0, w: 1440, h: 900 }, page)).toBe(true);
    expect(cropFitsPage({ x: 60, y: 100, w: 300, h: 200 }, page)).toBe(true);
  });

  it("accepts a region below the fold of a document taller than the viewport", () => {
    expect(cropFitsPage({ x: 0, y: 1600, w: 300, h: 120 }, { width: 1440, height: 2400 })).toBe(
      true,
    );
  });

  it("rejects a region whose origin is past the bottom of the page image", () => {
    expect(cropFitsPage({ x: 0, y: 1173, w: 4256, h: 1103 }, page)).toBe(false);
  });

  it("rejects a region that starts inside but extends past the edge", () => {
    expect(cropFitsPage({ x: 1200, y: 0, w: 500, h: 100 }, page)).toBe(false);
    expect(cropFitsPage({ x: 0, y: 800, w: 100, h: 500 }, page)).toBe(false);
  });

  it("rejects a region with a negative origin", () => {
    expect(cropFitsPage({ x: -40, y: 0, w: 100, h: 100 }, page)).toBe(false);
  });

  // Subpixel slack only — a box may overrun by a fraction through rounding, and
  // refusing those would drop legitimate previews.
  it("tolerates a subpixel overrun", () => {
    expect(cropFitsPage({ x: 0, y: 0, w: 1440.4, h: 900.4 }, page)).toBe(true);
  });
});
