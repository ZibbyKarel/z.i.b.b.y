import { describe, expect, it } from "vitest";
import { boardHeight, colWidth, rowsFor, widgetRect } from "./positions";
import { DEFAULT_LAYOUT } from "./presets";

describe("positions", () => {
  it("colWidth = (inner - gap*11) / 12", () => {
    expect(colWidth(1400, 10)).toBe((1400 - 110) / 12);
  });
  it("widgetRect matches README formula", () => {
    const cw = colWidth(1400, 10);
    expect(widgetRect({ x: 4, y: 3, w: 4, h: 18 }, cw, 10, 20)).toEqual({
      left: 4 * (cw + 10),
      top: 3 * 30,
      width: 4 * cw + 30,
      height: 18 * 20 + 17 * 10,
    });
  });
  it("boardHeight", () => {
    expect(boardHeight(DEFAULT_LAYOUT, 20, 10)).toBe(21 * 30 - 10);
    expect(boardHeight(DEFAULT_LAYOUT, 20, 10, 2)).toBe(21 * 30 - 10 + 60);
    expect(boardHeight([], 20, 10)).toBe(0);
  });
});

describe("rowsFor", () => {
  it("rounds content pixels up to whole rows, min 1", () => {
    expect(rowsFor(30, 30, 8)).toBe(1);
    expect(rowsFor(31, 30, 8)).toBe(2);
    expect(rowsFor(0, 30, 8)).toBe(1);
    expect(rowsFor(106, 30, 8)).toBe(3);
  });
});
