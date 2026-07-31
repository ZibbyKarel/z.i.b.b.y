import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { diffPngs } from "./pixels.mjs";

function png(width, height, paint) {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (width * y + x) << 2;
      const [r, g, b] = paint(x, y);
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(image);
}

const black = () => [0, 0, 0];

describe("diffPngs", () => {
  it("reports zero for identical images", () => {
    const buf = png(20, 20, black);
    const verdict = diffPngs(buf, Buffer.from(buf));
    expect(verdict.percent).toBe(0);
    expect(verdict.largestRegion).toEqual({ w: 0, h: 0 });
  });

  it("measures the largest contiguous differing region", () => {
    const a = png(20, 20, black);
    const b = png(20, 20, (x, y) =>
      x >= 4 && x < 10 && y >= 4 && y < 9 ? [255, 0, 0] : [0, 0, 0],
    );
    const verdict = diffPngs(a, b);
    expect(verdict.percent).toBeGreaterThan(0);
    expect(verdict.largestRegion).toEqual({ w: 6, h: 5 });
  });

  it("throws when the dimensions differ, naming both", () => {
    expect(() => diffPngs(png(10, 10, black), png(12, 10, black))).toThrow(/10×10.*12×10/);
  });
});
