/**
 * Notification discipline (Phase 6.3) — a PURE, client-side filter, NOT a store.
 * The roadmap is explicit: notify only when genuinely relevant, and "nothing else".
 * Exactly THREE kinds survive this selector, derived from current query state:
 *
 * - `approval` — a pending Tier-3 decision (any pending approval).
 * - `parked`   — a retries-parked run (RunView maps `parkedReason: "retries"` to
 *                `status: "parked"`; approval-parked runs read as awaiting-approval,
 *                so they never count here).
 * - `briefing` — the briefing flags something that needs the operator.
 *
 * Everything noisy (running runs, done/scheduled/failed runs, handled items, the
 * approval-parked state) is deliberately dropped. No read/unread state, no
 * persistence: the badge is a pure function of the live queries.
 */

export type NotificationKind = "approval" | "parked" | "briefing";

export interface Notification {
  kind: NotificationKind;
  id: string;
  label: string;
  href: string;
}

/** The minimal shapes the selector reads off the three existing queries. */
export interface NotificationInput {
  approvals: Array<{ id: string; skill?: string; action?: string }>;
  runs: Array<{ runId: string; status: string; title?: string }>;
  briefing?: { nothingNeedsYou: boolean };
}

export function selectNotifications(input: NotificationInput): Notification[] {
  const out: Notification[] = [];

  for (const a of input.approvals) {
    out.push({ kind: "approval", id: a.id, label: a.skill ?? a.action ?? a.id, href: "/runs" });
  }

  for (const r of input.runs) {
    // RunView already collapses retries-parked to `status: "parked"`.
    if (r.status === "parked") {
      out.push({ kind: "parked", id: r.runId, label: r.title || r.runId, href: "/runs" });
    }
  }

  if (input.briefing && !input.briefing.nothingNeedsYou) {
    out.push({ kind: "briefing", id: "briefing", label: "briefing", href: "/overview" });
  }

  return out;
}

/** The count that drives the runs nav badge: pending decisions + parked runs only. */
export function navBadgeCount(notifications: Notification[]): number {
  return notifications.filter((n) => n.kind === "approval" || n.kind === "parked").length;
}
