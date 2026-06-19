import { DAY_MS, HOUR_MS, MINUTE_MS } from "../../../utils/time";

/**
 * Format the time from `now` until `resetsAt` (both epoch ms) as a compact
 * `"6d 12h 4m"`, dropping any zero-valued part (so a sub-day span reads
 * `"12h 4m"` and a sub-hour span `"4m"`). Returns `null` when the reset is
 * unknown (`resetsAt == null`) or already elapsed — the caller then renders the
 * "unknown" copy instead. Locale-agnostic on purpose (bare numbers + d/h/m).
 */
export function formatResetIn(resetsAt: number | null, now: number): string | null {
  if (resetsAt == null) return null;
  const remaining = resetsAt - now;
  if (remaining <= 0) return null;
  const d = Math.floor(remaining / DAY_MS);
  const h = Math.floor((remaining % DAY_MS) / HOUR_MS);
  const m = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  // Always keep minutes when nothing larger survived, so we never render "".
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}
