import type { TaskRunStatus } from "@zibby/contracts";

/** Which flyout section is open. Reports are OMITTED this phase (operator decision). */
export type FlyoutSection = "working" | "waiting";

/** Shared close grace: leaving BOTH the pill and the panel for this long closes. */
export const CLOSE_GRACE_MS = 200;

/**
 * Stable DOM id on the pill root. The portalled panel's focus-out handler must
 * recognize focus moving back onto the pill (spec §6.2: "neither the pill nor the
 * panel"); it lives here — not in StatusPill — so StatusFlyoutPanel can import it
 * without a StatusPill↔panel import cycle.
 */
export const STATUS_PILL_DOM_ID = "chat-status-pill-root";

/**
 * Runs the "Pracují" section lists: actively running plus the spawning `pending`
 * (which "reads as live (pulses)" per RUN_STATE). Deliberately narrower than
 * RUN_STATUS_GROUPS.running — that bucket exists for feed filters, not liveness.
 */
export const WORKING_STATUSES: ReadonlySet<TaskRunStatus> = new Set(["running", "pending"]);

export interface FlyoutSectionMeta {
  /** Panel width in px (design: work 640, wait 720). */
  width: number;
  /** Header dot tone — DS DotTone vocabulary ("wait", not "warn"). */
  dotTone: "run" | "wait";
  /** Header title tone — DS TypographyTone vocabulary ("warn", not "wait"). */
  titleTone: "run" | "warn";
  /** 1px section-accent ring (design `0 0 0 1px ${color}22`) — the one visual value
   * with no DS token (no "state hue at 13% alpha" scale exists); composed with
   * var(--shadow-modal) by the panel. */
  ringShadow: string;
  /** Header wash (design `linear-gradient(180deg, ${color}14, transparent)`). */
  headerGradient: string;
}

export const SECTION_META: Record<FlyoutSection, FlyoutSectionMeta> = {
  working: {
    width: 640,
    dotTone: "run",
    titleTone: "run",
    ringShadow: "0 0 0 1px rgba(122,165,248,0.13)",
    headerGradient: "linear-gradient(180deg, rgba(122,165,248,0.08), transparent)",
  },
  waiting: {
    width: 720,
    dotTone: "wait",
    titleTone: "warn",
    ringShadow: "0 0 0 1px rgba(240,180,41,0.13)",
    headerGradient: "linear-gradient(180deg, rgba(240,180,41,0.08), transparent)",
  },
};

const DIVISIONS: ReadonlyArray<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "seconds" },
  { amount: 60, unit: "minutes" },
  { amount: 24, unit: "hours" },
  { amount: 7, unit: "days" },
];

/**
 * Localized relative timestamp for flyout rows ("3 minutes ago" / "před 3 minutami").
 * The panel is transient (re-opened fresh on each hover), so a static value at
 * render time is honest — no ticking interval needed.
 */
export function formatRelativeTime(iso: string, locale: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  let duration = (then - now.getTime()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount)
      return rtf.format(Math.round(duration), division.unit);
    duration /= division.amount;
  }
  return rtf.format(Math.round(duration), "weeks");
}
