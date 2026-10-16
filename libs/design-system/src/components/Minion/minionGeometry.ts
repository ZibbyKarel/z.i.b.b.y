import type { MinionAppearance } from "./minionAppearance";

export interface MinionGeometryInput {
  appearance: MinionAppearance;
  /** Horizontal centre in the viewBox (default 50). */
  cx?: number;
  /** Ground line y (default 104). */
  gy?: number;
}

export interface MinionGeometry {
  w: number;
  H: number;
  cx: number;
  gy: number;
  /** Body left edge. */
  x: number;
  /** Body top edge. */
  y: number;
  /** Goggle radius. */
  eyeR: number;
  eyeY: number;
  /** Mouth y. */
  my: number;
  /** Overalls top. */
  ovTop: number;
  bibTop: number;
  /** Shoulder y. */
  shY: number;
  /** Left / right shoulder x. */
  armL: number;
  armR: number;
  /** Top of the figure including a hat. */
  top: number;
}

/** Port of the design's `geo()` — every body measurement derives from width/height/eyes. */
export function minionGeometry({
  appearance,
  cx = 50,
  gy = 104,
}: MinionGeometryInput): MinionGeometry {
  const w = appearance.width;
  const H = appearance.height;
  const x = cx - w / 2;
  const y = gy - H;
  const two = appearance.eyes === 2;
  const eyeR = two ? Math.min(11, w / 4.2) : Math.min(13, H * 0.22);
  const eyeY = y + Math.max(eyeR + 4, H * 0.28);
  const my = eyeY + eyeR + 6;
  const ovTop = gy - H * 0.26;
  const bibTop = Math.max(my + 5, ovTop - 9);
  const shY = bibTop - 1;
  return {
    w,
    H,
    cx,
    gy,
    x,
    y,
    eyeR,
    eyeY,
    my,
    ovTop,
    bibTop,
    shY,
    armL: x + 1.5,
    armR: x + w - 1.5,
    top: y - (appearance.hat ? 6 : 0),
  };
}
