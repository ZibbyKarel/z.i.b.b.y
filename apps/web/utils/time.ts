/** Shared millisecond constants for tick intervals and countdown formatting. */
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Human relative time like "před 3 m" / "3 m ago" — coarse (minutes, then
 * hours), for feeds. The `ago` callback renders the localized phrase; it is
 * called with `(0, "m")` for "just now".
 */
export function relativeTime(
  iso: string,
  now: number,
  ago: (n: number, unit: string) => string,
): string {
  const diffMs = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diffMs / MINUTE_MS);
  if (min < 1) return ago(0, "m");
  if (min < 60) return ago(min, "m");
  const h = Math.floor(min / 60);
  return ago(h, "h");
}

/** Compact relative time ("now" / "3m" / "2h") for dense panels. */
export const compactAgo = (iso: string, now: number): string =>
  relativeTime(iso, now, (n, unit) => (n === 0 ? "now" : `${n}${unit}`));
