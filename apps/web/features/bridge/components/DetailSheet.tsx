"use client";

import type { BridgeSelection } from "../widgets/registry";

export interface DetailSheetProps {
  selection: BridgeSelection | null;
  onClose: () => void;
}

/** Placeholder — the detail sheet (issue / task / PR) replaces this. Mounted over the board. */
export function DetailSheet(props: DetailSheetProps) {
  void props;
  return null;
}
