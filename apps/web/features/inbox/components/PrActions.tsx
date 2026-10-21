"use client";

import type { InboxPr } from "@zibby/contracts";
import { PrActionButtons } from "./PrActionButtons";

export { hasPrActions } from "../state/prActions";
export {
  PrActionsTestId,
  REVIEW_MODES,
  REVIEW_MODE_STORAGE_KEY,
  type PrReviewMode,
} from "./PrActionButtons";

export interface PrActionsProps {
  pr: InboxPr;
  /** What the PR sits on (`prBaseLabel`): `#12` or a branch — "Rebase on …". */
  baseLabel: string;
}

/** A PR card's action row — see `PrActionButtons` for the behavior. */
export function PrActions({ pr, baseLabel }: PrActionsProps) {
  return <PrActionButtons baseLabel={baseLabel} pr={pr} />;
}
