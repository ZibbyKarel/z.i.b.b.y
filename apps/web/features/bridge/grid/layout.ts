import type { BridgeWidget } from "@zibby/contracts";

export type { BridgeWidget };
export type WidgetType = BridgeWidget["type"];

export type WidgetTuple = readonly [WidgetType, number, number, number, number];

export interface DragOrigin {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const COLS = 12;

export function fromArr(a: readonly WidgetTuple[]): BridgeWidget[] {
  return a.map(([type, x, y, w, h]) => ({ id: type, type, x, y, w, h }));
}

const hit = (a: BridgeWidget, b: BridgeWidget): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Priority item first, then by y, then x. Non-priority items fall to the first y free of overlap. */
export function compact(layout: readonly BridgeWidget[], priorityId?: string): BridgeWidget[] {
  const items = layout.map((i) => ({ ...i }));
  const placed: BridgeWidget[] = [];
  items
    .slice()
    .sort(
      (a, b) => (a.id === priorityId ? -1 : b.id === priorityId ? 1 : 0) || a.y - b.y || a.x - b.x,
    )
    .forEach((it) => {
      if (it.id !== priorityId) {
        let y = 0;
        while (placed.some((p) => hit({ ...it, y }, p))) y++;
        it.y = y;
      }
      placed.push(it);
    });
  return items;
}

/** Pixel delta -> whole cell delta (colW/rowH exclude the gap). */
export function toCells(
  pxDx: number,
  pxDy: number,
  colW: number,
  gap: number,
  rowH: number,
): { dx: number; dy: number } {
  return {
    dx: Math.round(pxDx / (colW + gap)),
    dy: Math.round(pxDy / (rowH + gap)),
  };
}

function withTarget(
  layout: readonly BridgeWidget[],
  id: string,
  edit: (t: BridgeWidget) => void,
): BridgeWidget[] {
  const next = layout.map((i) => ({ ...i }));
  const t = next.find((i) => i.id === id);
  if (t) edit(t);
  return compact(next, id);
}

export function dragMove(
  layout: readonly BridgeWidget[],
  id: string,
  origin: DragOrigin,
  dx: number,
  dy: number,
): BridgeWidget[] {
  return withTarget(layout, id, (t) => {
    t.x = Math.max(0, Math.min(COLS - t.w, origin.x + dx));
    t.y = Math.max(0, origin.y + dy);
  });
}

export function dragResize(
  layout: readonly BridgeWidget[],
  id: string,
  origin: DragOrigin,
  dx: number,
  dy: number,
): BridgeWidget[] {
  return withTarget(layout, id, (t) => {
    t.w = Math.max(2, Math.min(COLS - t.x, origin.w + dx));
    t.h = Math.max(2, origin.h + dy);
  });
}

export function addWidget(layout: readonly BridgeWidget[], type: WidgetType): BridgeWidget[] {
  return compact([...layout, { id: type, type, x: 0, y: 999, w: 4, h: 6 }]);
}

export function removeWidget(layout: readonly BridgeWidget[], id: string): BridgeWidget[] {
  return compact(layout.filter((i) => i.id !== id));
}

/** View mode: empty/collapsed widgets shrink to h=1, then the board compacts. */
export function viewLayout(
  layout: readonly BridgeWidget[],
  shrinkIds: ReadonlySet<string>,
): BridgeWidget[] {
  return compact(layout.map((it) => (shrinkIds.has(it.id) ? { ...it, h: 1 } : it)));
}
