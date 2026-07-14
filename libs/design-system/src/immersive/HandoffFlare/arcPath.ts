/**
 * Quadratic-bezier arc path between two points, bowed off-axis by `bend`.
 *
 * Ported verbatim from `vcArcPath` in the original orb-map prototype
 * (`design/Z.I.B.B.Y/zibby/velin-d-map.jsx`) — routes the `HandoffFlare`
 * comet's `offset-path` between a source and target orb centre.
 */
export function arcPath(x1: number, y1: number, x2: number, y2: number, bend = 0.16): string {
  const mx = (x1 + x2) / 2 + (y2 - y1) * bend;
  const my = (y1 + y2) / 2 - (x2 - x1) * bend;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}
