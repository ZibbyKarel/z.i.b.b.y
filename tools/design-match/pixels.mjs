import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

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

/**
 * A png's dimensions, read from the buffer itself rather than derived from a DOM
 * box — `sizePreflight` (preflight.mjs) compares what was actually captured, and
 * device-pixel ratio, transforms and border-box rounding all sit between a
 * `getBoundingClientRect` and the image Playwright produced. This module already
 * owns png decoding, so the decoding stays in one place.
 */
export function pngSize(buffer) {
  const { width, height } = PNG.sync.read(buffer);
  return { width, height };
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
    throw new Error(
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
