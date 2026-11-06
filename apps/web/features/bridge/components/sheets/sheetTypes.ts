import type { StateTone } from "@zibby/design-system";
import type { SheetAnchor } from "../../state/measure";
import type { BridgeSelection } from "../../widgets/registry";

/** What every sheet receives from `DetailSheet`. */
export interface SheetProps {
  /** Item id (`BridgeSelection.id`). */
  id: string;
  anchor: SheetAnchor;
  onClose: () => void;
  /** Opens another entity (issue / PR / run) in this sheet; absent outside the bridge. */
  onOpen?: (selection: BridgeSelection) => void;
}

const WIDGET = { issue: "issues", pr: "prs", run: "runs" } as const;

/** Selection for a cross-sheet jump. The target row may not be on the board — the sheet keeps its anchor. */
export const selectionFor = (kind: keyof typeof WIDGET, id: string): BridgeSelection => ({
  kind,
  id,
  widgetId: WIDGET[kind],
  key: `${WIDGET[kind]}:${id}`,
});

/** Geometry props for `AnchoredSheet`, from a measured anchor. */
export const geometry = (a: SheetAnchor) => ({
  left: a.left,
  width: a.width,
  top: a.top,
  height: a.height,
  eraserLeft: a.eL,
  eraserTop: a.eT,
  eraserHeight: a.eH,
});

/** `TaskParentState` and friends are already DS tones; keep the type visible for callers. */
export type SheetStateTone = StateTone;
