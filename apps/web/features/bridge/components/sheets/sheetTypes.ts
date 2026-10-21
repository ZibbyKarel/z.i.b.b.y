import type { StateTone } from "@zibby/design-system";
import type { SheetAnchor } from "../../state/measure";

/** What every sheet receives from `DetailSheet`. */
export interface SheetProps {
  /** Item id (`BridgeSelection.id`). */
  id: string;
  anchor: SheetAnchor;
  onClose: () => void;
}

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
