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
  /** Cover: minimum share of saturated pixels / maximum share of near-white pixels. */
  minColor: number;
  maxWhite: number;
}

export const DEFAULT_THRESHOLDS: PixelThresholds = {
  maxGray: 0.08,
  minInk: 0.01,
  maxInk: 0.35,
  maxMarginInk: 0.0005,
  minColor: 0.25,
  maxWhite: 0.45,
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

/** QA over the full-colour cover art: it must read as a colourful cover, not white line art. */
export function coverQa(
  colorRatio: number,
  whiteRatio: number,
  t: PixelThresholds = DEFAULT_THRESHOLDS,
): QaIssue[] {
  const issues: QaIssue[] = [];
  if (colorRatio < t.minColor)
    issues.push({
      type: "not-colorful",
      severity: "high",
      description: `colour ratio ${colorRatio.toFixed(3)} < ${t.minColor} (cover must be full colour)`,
    });
  if (whiteRatio > t.maxWhite)
    issues.push({
      type: "not-colorful",
      severity: "high",
      description: `white ratio ${whiteRatio.toFixed(3)} > ${t.maxWhite} (cover needs a coloured background)`,
    });
  return issues;
}

/**
 * QA over the processed (pure black/white) page. `rawGrayRatio` comes from the raw generated image.
 * `box` is the content box; ink outside it counts as margin violation.
 */
export function pixelQa(
  processed: Uint8Array,
  width: number,
  rawGrayRatio: number,
  box: Box | null,
  t: PixelThresholds = DEFAULT_THRESHOLDS,
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
  // ponytail: contour closure needs flood-fill analysis (white region touching the border = open shape); add when QA lets open shapes through.
  return { grayRatio: rawGrayRatio, inkRatio, openRegions: 0, marginInk, issues };
}

/**
 * How busy a cover zone is: the share of pixels far (RGB L1 > 90) from the zone's dominant colour.
 * Calm sky under the title scores ~0.1; a character's face scores well above 0.2.
 */
export function busyRatio(rgb: Uint8Array, width: number, box: Box): number {
  const hist = new Map<number, number>();
  const at = (x: number, y: number): number => (y * width + x) * 3;
  for (let y = box.y; y < box.y + box.h; y += 2)
    for (let x = box.x; x < box.x + box.w; x += 2) {
      const i = at(x, y);
      const key =
        ((rgb[i] ?? 0) >> 3) * 1024 + ((rgb[i + 1] ?? 0) >> 3) * 32 + ((rgb[i + 2] ?? 0) >> 3);
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
  let mode = 0;
  let best = -1;
  for (const [k, n] of hist) if (n > best) [mode, best] = [k, n];
  const dom = [((mode >> 10) << 3) + 4, (((mode >> 5) & 31) << 3) + 4, ((mode & 31) << 3) + 4];
  let far = 0;
  let all = 0;
  for (let y = box.y; y < box.y + box.h; y += 2)
    for (let x = box.x; x < box.x + box.w; x += 2) {
      const i = at(x, y);
      const d =
        Math.abs((rgb[i] ?? 0) - (dom[0] ?? 0)) +
        Math.abs((rgb[i + 1] ?? 0) - (dom[1] ?? 0)) +
        Math.abs((rgb[i + 2] ?? 0) - (dom[2] ?? 0));
      if (d > 90) far++;
      all++;
    }
  return far / (all || 1);
}

export function busyZoneQa(zones: { name: string; ratio: number }[], max: number): QaIssue[] {
  return zones
    .filter((z) => z.ratio > max)
    .map((z) => ({
      type: "busy-zone" as const,
      severity: "high" as const,
      description: `${z.name} zone is busy (${z.ratio.toFixed(3)} > ${max}): keep that area plain background, move characters and objects away from it`,
    }));
}
