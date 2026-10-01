import type { QaIssue } from "../schemas.ts";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PixelThresholds {
  maxGray: number;
  minInk: number;
  maxInk: number;
  maxMarginInk: number;
}

export const DEFAULT_THRESHOLDS: PixelThresholds = {
  maxGray: 0.08,
  minInk: 0.01,
  maxInk: 0.35,
  maxMarginInk: 0.0005,
};

export interface PixelResult {
  grayRatio: number;
  inkRatio: number;
  openRegions: number;
  marginInk: number;
  issues: QaIssue[];
}

/** Share of pixels with a mid-tone value (40..215) — i.e. shading instead of clean line art. */
export function grayRatioOf(gray: Uint8Array): number {
  let n = 0;
  for (const v of gray) if (v >= 40 && v <= 215) n++;
  return n / (gray.length || 1);
}

/**
 * QA over the processed (pure black/white) page. `rawGrayRatio` comes from the raw generated image.
 * `box` is the content box; ink outside it counts as margin violation. `box: null` + `grayOnly` = cover art.
 */
export function pixelQa(
  processed: Uint8Array,
  width: number,
  rawGrayRatio: number,
  box: Box | null,
  t: PixelThresholds = DEFAULT_THRESHOLDS,
  grayOnly = false,
): PixelResult {
  let ink = 0;
  let marginInkPx = 0;
  for (let y = 0; y < processed.length / width; y++) {
    const row = y * width;
    const inRows = box !== null && y >= box.y && y < box.y + box.h;
    for (let x = 0; x < width; x++) {
      if ((processed[row + x] ?? 255) >= 128) continue;
      ink++;
      if (box && !(inRows && x >= box.x && x < box.x + box.w)) marginInkPx++;
    }
  }
  const total = processed.length || 1;
  const marginArea = box ? total - box.w * box.h : 0;
  const inkRatio = ink / total;
  const marginInk = marginArea > 0 ? marginInkPx / marginArea : 0;
  const issues: QaIssue[] = [];
  if (rawGrayRatio > t.maxGray)
    issues.push({
      type: "gray-area",
      severity: "high",
      description: `gray ratio ${rawGrayRatio.toFixed(3)} > ${t.maxGray} (shading instead of line art)`,
    });
  if (!grayOnly) {
    if (inkRatio < t.minInk)
      issues.push({
        type: "too-sparse",
        severity: "high",
        description: `ink ratio ${inkRatio.toFixed(4)} < ${t.minInk}`,
      });
    if (inkRatio > t.maxInk)
      issues.push({
        type: "too-complex",
        severity: "medium",
        description: `ink ratio ${inkRatio.toFixed(3)} > ${t.maxInk}`,
      });
    if (marginInk > t.maxMarginInk)
      issues.push({
        type: "margin-violation",
        severity: "medium",
        description: `ink in margin area: ${marginInk.toFixed(5)} > ${t.maxMarginInk}`,
      });
  }
  // ponytail: contour closure needs flood-fill analysis (white region touching the border = open shape); add when QA lets open shapes through.
  return { grayRatio: rawGrayRatio, inkRatio, openRegions: 0, marginInk, issues };
}
