import { useMemo } from "react";
import { type InboxCounts, inboxCounts } from "./inbox";
import { useInboxItemsQuery, useInboxPrsQuery } from "./queries";

/**
 * Global sub-nav counters (ignore filters, actionable only). Shares the screens'
 * query keys, so enabling it inside the Inbox section costs no extra requests;
 * `undefined` until both lists have loaded.
 */
export function useInboxCounts(enabled: boolean): InboxCounts | undefined {
  const items = useInboxItemsQuery({ enabled }).data?.items;
  const prs = useInboxPrsQuery({ enabled }).data?.prs;
  return useMemo(() => (items && prs ? inboxCounts(items, prs) : undefined), [items, prs]);
}
