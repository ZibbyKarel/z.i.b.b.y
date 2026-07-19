"use client";

import { useApprovalsQuery } from "../approvals";
import { useBriefingQuery } from "../briefing";
import { useRunsQuery } from "../runs";
import { type Notification, selectNotifications } from "./notificationRules";

/**
 * Compose the three existing queries (pending approvals + runs + the briefing) into
 * the disciplined notification set. No new transport: the `/api/events` SSE channel
 * already invalidates all three, so the badge refreshes live off them.
 */
export function useNotifications(): Notification[] {
  const { data: approvals = [] } = useApprovalsQuery();
  const { runs } = useRunsQuery();
  const { data: briefing } = useBriefingQuery();

  return selectNotifications({
    approvals,
    runs,
    briefing: briefing ? { nothingNeedsYou: briefing.nothingNeedsYou } : undefined,
  });
}
