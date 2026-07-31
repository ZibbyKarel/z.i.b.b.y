import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { DesignMatchError } from "./errors.mjs";

/**
 * The largest contiguous differing region matters more than the raw percentage:
 * 0.4 % spread as antialiasing is noise, 0.4 % concentrated in one 40×30 block
 * is a real visual defect. The done-condition uses both.
 */
function largestDifferingRegion(diff, width, height) {
  const differs = (x, y) =>
    diff.data[((width * y + x) << 2) + 0] > 0 || diff.data[((width * y + x) << 2) + 1] > 0;
  const seen = new Uint8Array(width * height);
  let best = { w: 0, h: 0 };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (seen[width * y + x] || !differs(x, y)) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const stack = [[x, y]];
      seen[width * y + x] = 1;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (seen[width * ny + nx] || !differs(nx, ny)) continue;
          seen[width * ny + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      if (w * h > best.w * best.h) best = { w, h };
    }
  }
  return best;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// A png is: the 8-byte signature, then a chunk (4-byte length, 4-byte type,
// payload). The first chunk is required by the format to be IHDR, whose payload
// opens with width and height as big-endian uint32s.
const IHDR_TYPE_AT = 12;
const WIDTH_AT = 16;
const HEIGHT_AT = 20;
const HEADER_BYTES = HEIGHT_AT + 4;

/**
 * A png's dimensions, read from the buffer itself rather than derived from a DOM
 * box — `sizePreflight` (preflight.mjs) compares what was actually captured, and
 * device-pixel ratio, transforms and border-box rounding all sit between a
 * `getBoundingClientRect` and the image Playwright produced.
 *
 * Fix round 1, Minor 3: this used to call `PNG.sync.read`, which inflates every
 * scanline — so a clean round decoded both images once for the size check and
 * again inside `diffPngs`. Reading the IHDR is not a shortcut around the format;
 * those 24 bytes are exactly where a png declares its size. Anything that is not
 * a well-formed png header falls through to `PNG.sync.read`, which keeps this
 * function's failure behaviour identical to what it was — the fast path only
 * ever runs on input the slow path would have agreed with.
 */
export function pngSize(buffer) {
  const hasPngHeader =
    buffer.length >= HEADER_BYTES &&
    buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
    buffer.toString("latin1", IHDR_TYPE_AT, IHDR_TYPE_AT + 4) === "IHDR";
  if (!hasPngHeader) {
    const { width, height } = PNG.sync.read(buffer);
    return { width, height };
  }
  return { width: buffer.readUInt32BE(WIDTH_AT), height: buffer.readUInt32BE(HEIGHT_AT) };
}

export function diffPngs(designBuf, appBuf, options = {}) {
  const design = PNG.sync.read(designBuf);
  const app = PNG.sync.read(appBuf);
  // D10 (task 19): kept as a LAST-RESORT INVARIANT. A library function that
  // diffs two buffers must still refuse mismatched ones rather than produce a
  // number — but nothing in normal operation reaches it any more, because
  // `runCompare` asks `sizePreflight` first and parks with both images on disk.
  // If this ever fires again it means a caller skipped that check, and the stack
  // is the diagnostic.
  if (design.width !== app.width || design.height !== app.height) {
    throw new DesignMatchError(
      `design-match: rozměry se liší — design ${design.width}×${design.height}, app ${app.width}×${app.height}`,
    );
  }
  const diff = new PNG({ width: design.width, height: design.height });
  // diffMask: true keeps matching (and anti-aliased) pixels fully transparent in the
  // output buffer. Without it, pixelmatch paints the *background* as a dimmed
  // grayscale copy of the source image — for a black source that is still non-zero
  // in R/G, so largestDifferingRegion's differs() check would flag the whole canvas
  // as "differing" instead of just the true diff pixels.
  const differing = pixelmatch(design.data, app.data, diff.data, design.width, design.height, {
    threshold: options.threshold ?? 0.1,
    diffMask: true,
  });
  return {
    percent: Math.round((differing / (design.width * design.height)) * 10000) / 100,
    diffBuffer: PNG.sync.write(diff),
    largestRegion:
      differing === 0 ? { w: 0, h: 0 } : largestDifferingRegion(diff, design.width, design.height),
  };
}
