import { type BridgeWidget, type WidgetTuple, compact, fromArr } from "./layout";

export const DEFAULT_PRESET = "DEFAULT";
export const REVIEW_PRESET = "REVIEW";

const DEFAULT_TUPLES: readonly WidgetTuple[] = [
  ["briefing", 0, 0, 12, 3],
  ["issues", 0, 3, 4, 18],
  ["prs", 4, 3, 4, 18],
  ["tasks", 8, 3, 4, 10],
  ["runs", 8, 13, 4, 8],
];

const REVIEW_TUPLES: readonly WidgetTuple[] = [
  ["prs", 0, 0, 6, 21],
  ["issues", 6, 0, 3, 21],
  ["tasks", 9, 0, 3, 11],
  ["runs", 9, 11, 3, 10],
];

export const DEFAULT_LAYOUT: BridgeWidget[] = fromArr(DEFAULT_TUPLES);
export const REVIEW_LAYOUT: BridgeWidget[] = fromArr(REVIEW_TUPLES);

/** Compacted layout for a preset name: DEFAULT, REVIEW, else a saved layout (empty if unknown). */
export function presetLayout(
  name: string,
  saved: Readonly<Record<string, readonly BridgeWidget[]>>,
): BridgeWidget[] {
  if (name === DEFAULT_PRESET) return compact(DEFAULT_LAYOUT);
  if (name === REVIEW_PRESET) return compact(REVIEW_LAYOUT);
  return compact(saved[name] ?? []);
}

/** First free `MY LAYOUT NN` (two digits). */
export function nextSavedName(saved: Readonly<Record<string, unknown>>): string {
  for (let n = 1; ; n++) {
    const name = `MY LAYOUT ${String(n).padStart(2, "0")}`;
    if (!(name in saved)) return name;
  }
}

const RESERVED = ["DEFAULT", "REVIEW", "CUSTOM"];

/** Why a layout name can't be saved (checked on the trimmed name), or null if it can. */
export function layoutNameError(
  name: string,
  saved: Readonly<Record<string, unknown>>,
): "required" | "tooLong" | "reserved" | "taken" | null {
  const n = name.trim().toUpperCase();
  if (!n) return "required";
  if (n.length > 40) return "tooLong";
  if (RESERVED.includes(n)) return "reserved";
  if (Object.keys(saved).some((k) => k.toUpperCase() === n)) return "taken";
  return null;
}
