import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { diffPngs, pngSize } from "./pixels.mjs";

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

describe("pngSize", () => {
  /*
   * Fix round 1, Minor 3. `pngSize` reads the IHDR instead of inflating the
   * image, so the assertion that matters is that it agrees with the full decode
   * on a non-square image — width and height must not be swapped, and the
   * big-endian offsets must be right.
   */
  it("agrees with a full decode, on a non-square image", () => {
    const buf = png(13, 29, black);
    expect(pngSize(buf)).toEqual({ width: 13, height: 29 });
    const decoded = PNG.sync.read(buf);
    expect(pngSize(buf)).toEqual({ width: decoded.width, height: decoded.height });
  });

  it("reads sizes past a byte boundary, so the four-byte fields are not truncated", () => {
    expect(pngSize(png(300, 258, black))).toEqual({ width: 300, height: 258 });
  });

  /*
   * IHDR's width and height are 32-bit, and reading only their low half agrees
   * with the decoder for every image under 65536 px — which is every screenshot
   * this tool has ever taken, so nothing else in the suite can tell the two
   * apart. D9's own region is 16256×18608 at DPR 2 (32512×37216), one doubling
   * short of the boundary, so "unreachable" is not a claim worth resting on.
   */
  it("reads a dimension past 65535, where a 16-bit read would silently agree", () => {
    const image = new PNG({ width: 65540, height: 1 });
    image.data.fill(0);
    expect(pngSize(PNG.sync.write(image))).toEqual({ width: 65540, height: 1 });
  });

  // The header read is a fast path, not a new contract: anything that is not a
  // png still fails exactly the way the full decode failed before.
  it("falls back to the decoder when the buffer is not a png", () => {
    expect(() => pngSize(Buffer.from("nothing like a png at all", "utf8"))).toThrow();
  });

  it("falls back when the signature is right but the first chunk is not IHDR", () => {
    const buf = Buffer.from(png(10, 10, black));
    buf.write("IEND", 12, "latin1");
    expect(() => pngSize(buf)).toThrow();
  });
});
