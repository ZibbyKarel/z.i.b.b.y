import { describe, expect, it } from "vitest";
import { type RectLike, anchorChanged, measureSheet } from "./measure";

const rect = (left: number, top: number, width: number, height: number): RectLike => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  height,
});

const root = rect(100, 50, 1200, 800); // right 1300, bottom 850
const board = rect(100, 98, 1200, 752);

describe("measureSheet", () => {
  it("opens right when the right side has more room, flush to the row's right edge", () => {
    const row = rect(120, 200, 400, 30); // 20 left, 780 right
    const a = measureSheet(root, row, board);
    expect(a).toEqual({
      side: "r",
      left: 520 - 100 - 1,
      width: 780 + 1,
      top: 48,
      height: 850 - 98,
      eL: -2,
      eT: 200 - 98 - 4,
      eH: 30,
    });
  });

  it("opens left when the left side has more room, even if the right is wider than 460px", () => {
    const row = rect(900, 300, 100, 40); // 800 left, 300 right
    const a = measureSheet(root, row, board);
    expect(a.side).toBe("l");
    expect(a.left).toBe(0);
    expect(a.width).toBe(900 - 100 + 1);
    expect(a.eL).toBe(a.width - 2);
    expect(a.eT).toBe(300 - 98 - 4);
  });

  it("prefers the right side on a tie and flips as soon as the left is wider", () => {
    expect(measureSheet(root, rect(600, 0, 200, 10), board).side).toBe("r"); // 500 / 500
    expect(measureSheet(root, rect(601, 0, 200, 10), board).side).toBe("l"); // 501 / 499
  });
});

describe("anchorChanged", () => {
  const a = measureSheet(root, rect(120, 200, 400, 30), board);
  it("is true without a previous anchor", () => expect(anchorChanged(a, null)).toBe(true));
  it("ignores sub-half-pixel jitter", () =>
    expect(anchorChanged({ ...a, left: a.left + 0.4 }, a)).toBe(false));
  it("flags a real move or a side flip", () => {
    expect(anchorChanged({ ...a, eT: a.eT + 1 }, a)).toBe(true);
    expect(anchorChanged({ ...a, side: "l" }, a)).toBe(true);
  });
});
