/** The rect fields `measure` reads — a DOMRect satisfies it. */
export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  height: number;
}

/** Where the detail sheet sits, in px relative to the screen root. */
export interface SheetAnchor {
  side: "r" | "l";
  left: number;
  width: number;
  top: number;
  height: number;
  /** Eraser strip: left (inside the sheet), top (below the 4px top border), height. */
  eL: number;
  eT: number;
  eH: number;
}

/**
 * Open on whichever side of the row has more room — right (left edge = row's right edge) on a tie,
 * else left (right edge = row's left edge). Vertical extent is
 * the board top to the root bottom. The 3px eraser covers the shared edge at the row's height.
 */
export function measureSheet(root: RectLike, row: RectLike, board: RectLike): SheetAnchor {
  const rightSpace = root.right - row.right;
  const leftSpace = row.left - root.left;
  const side = rightSpace >= leftSpace ? "r" : "l";
  const left = side === "r" ? row.right - root.left - 1 : 0;
  const width = side === "r" ? rightSpace + 1 : row.left - root.left + 1;
  return {
    side,
    left,
    width,
    top: board.top - root.top,
    height: root.bottom - board.top,
    eL: side === "r" ? -2 : width - 2,
    eT: row.top - board.top - 4,
    eH: row.height,
  };
}

/** True when any numeric field moved more than half a pixel (or the side flipped). */
export function anchorChanged(a: SheetAnchor, b: SheetAnchor | null): boolean {
  if (!b) return true;
  return (
    a.side !== b.side ||
    (["left", "width", "top", "height", "eL", "eT", "eH"] as const).some(
      (k) => Math.abs(a[k] - b[k]) > 0.5,
    )
  );
}
