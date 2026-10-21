import type { StateTone } from "../../stateTone";

/** Tone of a sheet accent (border stripe): a state colour, `neutral` (`--line2`) or `faint` (`--line`). */
export type SheetTone = StateTone | "neutral" | "faint";

type Edge = Record<SheetTone, string>;

// Full class strings per edge so Tailwind's scanner sees them.
export const toneBorderTop: Edge = {
  working: "border-t-state-work",
  thinking: "border-t-state-think",
  blocked: "border-t-state-block",
  error: "border-t-state-err",
  done: "border-t-state-done",
  idle: "border-t-state-idle",
  neutral: "border-t-line-2",
  faint: "border-t-line",
};
export const toneBorderBottom: Edge = {
  working: "border-b-state-work",
  thinking: "border-b-state-think",
  blocked: "border-b-state-block",
  error: "border-b-state-err",
  done: "border-b-state-done",
  idle: "border-b-state-idle",
  neutral: "border-b-line-2",
  faint: "border-b-line",
};
export const toneBorderLeft: Edge = {
  working: "border-l-state-work",
  thinking: "border-l-state-think",
  blocked: "border-l-state-block",
  error: "border-l-state-err",
  done: "border-l-state-done",
  idle: "border-l-state-idle",
  neutral: "border-l-line-2",
  faint: "border-l-line",
};
