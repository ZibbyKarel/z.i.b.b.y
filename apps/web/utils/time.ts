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

/**
 * A span of milliseconds as a compact duration ("45s" / "3m 12s" / "2h 5m") — the
 * coarser unit only shows when non-zero, so a sub-minute run reads "45s" rather
 * than "0m 45s". Negative/NaN spans (a clock skew, an in-flight run) clamp to "0s".
 */
export function formatDuration(ms: number): string {
  const totalSec = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Wall-clock "HH:MM" in the viewer's local timezone (fixes the UTC-slice bug). */
export function clockTime(iso: string, locale: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Phase 9 — render a limit-pause resume time (epoch ms). Within 24 h it reads as an
 * absolute wall-clock "~HH:MM" (the operator thinks "resumes around 04:30"); further
 * out it falls back to a coarse relative "~Nd". Locale drives the HH:MM formatting;
 * `now` is passed so the choice is deterministic and testable. An already-past or
 * absent reset reads "soon".
 */
export function resumeEta(
  resumeAt: number | null | undefined,
  now: number,
  locale: string,
): string {
  if (resumeAt == null) return "soon";
  const diff = resumeAt - now;
  if (diff <= 0) return "soon";
  if (diff < DAY_MS) {
    const hhmm = new Date(resumeAt).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `~${hhmm}`;
  }
  const days = Math.round(diff / DAY_MS);
  return `~${days}d`;
}
