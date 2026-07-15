// ellipseLayout.ts — ports the responsive ellipse math from the original orb map prototype
export interface EllipseInsets {
  /** Top reserve (e.g. the chat top bar height) — shifts the whole ellipse down and out from under it. */
  top: number;
  /** Left reserve (e.g. the tasks panel width). */
  left: number;
  /** Right reserve (e.g. a floating dock). */
  right: number;
  /** Bottom reserve subtracted from usable height (e.g. the chat dock). */
  bottom: number;
}

export interface OrbPosition {
  x: number;
  y: number;
}

export interface EllipseLayout {
  cx: number;
  cy: number;
  radiusX: number;
  radiusY: number;
  nodeD: number;
  coreSize: number;
  positions: OrbPosition[];
}

const clamp = (min: number, v: number, max: number): number => Math.max(min, Math.min(max, v));

/**
 * Responsive ellipse geometry for the orb map. Pure — no DOM. `count` nodes are
 * spread evenly from 12 o'clock clockwise (`angle_i = -PI/2 + i * 2PI / count`).
 * On low canvases the core and nodes shrink so the orbit fits above the bottom
 * reserve without overlap. Ported from the original orb map prototype's layout block.
 */
export function ellipseLayout(
  w: number,
  h: number,
  count: number,
  insets: EllipseInsets,
): EllipseLayout {
  const leftInset = clamp(0, insets.left, w * 0.32 > 336 ? 336 : w * 0.32);
  const rightInset = clamp(0, insets.right, w * 0.1 > 108 ? 108 : w * 0.1);
  const cx = w / 2 + (leftInset - rightInset) / 2;
  const topInset = clamp(0, insets.top, h * 0.5); // guard: never eat more than half the height
  const usableH = Math.max(220, h - insets.bottom - topInset);

  const nodeD = clamp(48, usableH * 0.2, 76);
  const topPad = nodeD / 2 + 16;
  const bottomExtent = nodeD / 2 + 54; // 10 gap + 44 two-line label
  const radiusY = Math.max(84, (usableH - topPad - bottomExtent) / 2);
  const cy = topInset + topPad + radiusY;
  const coreSize = clamp(96, radiusY * 1.5, 264);
  const radiusX = clamp(150, (w - leftInset - rightInset) / 2 - (nodeD / 2 + 64), 340);

  const positions: OrbPosition[] = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    positions.push({ x: cx + radiusX * Math.cos(a), y: cy + radiusY * Math.sin(a) });
  }
  return { cx, cy, radiusX, radiusY, nodeD, coreSize, positions };
}
