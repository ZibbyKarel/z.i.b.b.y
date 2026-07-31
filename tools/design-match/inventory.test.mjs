import { describe, expect, it } from "vitest";
import { rankCandidates } from "./inventory.mjs";

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

  it("ranks by class-name match first", () => {
    expect(rankCandidates(regions, "karta")[0].selector).toBe(".card");
  });

  it("matches on text content too", () => {
    expect(rankCandidates(regions, "jméno")[0].selector).toBe(".row");
  });

  it("falls back to the largest region when nothing matches", () => {
    expect(rankCandidates(regions, "naprosto nesouvisející")[0].selector).toBe(".card");
  });
});
