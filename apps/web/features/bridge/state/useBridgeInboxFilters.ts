"use client";

import { useState } from "react";
import { EMPTY_INBOX_FILTERS, type InboxFilters } from "../../inbox/inbox";
import { readStoredInboxFilters } from "../../inbox/useInboxFilters";

/**
 * The company / team / project filters the operator last chose on the inbox screens (the
 * same `zibby-inbox-filters` store). Read once on mount and WITHOUT `useInboxFilters`, whose
 * restore effect would rewrite the Bridge URL with `?company=...`.
 */
export function useBridgeInboxFilters(): InboxFilters {
  const [filters] = useState<InboxFilters>(() => readStoredInboxFilters() ?? EMPTY_INBOX_FILTERS);
  return filters;
}
