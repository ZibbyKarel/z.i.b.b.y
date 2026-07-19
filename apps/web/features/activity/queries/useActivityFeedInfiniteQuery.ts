import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { ActivityEntry, ActivityPage } from "@zibby/contracts";
import { apiClient } from "../../../state/api";

/** ts-rest wraps every page in the `{ status, body }` envelope. */
type ActivityPageResponse = { status: 200; body: ActivityPage };

/** Cache key for the RightRail live-log feed. Exported so the SSE bridge can reach it. */
export function getActivityFeedQueryKey() {
  return ["activity", "feed"] as const;
}

const PAGE_SIZE = 50;

/** Flatten the loaded pages into one newest-first, id-deduped entry list. */
function selectActivityFeed(data: InfiniteData<ActivityPageResponse>): ActivityEntry[] {
  const seen = new Set<string>();
  const out: ActivityEntry[] = [];
  for (const page of data.pages) {
    for (const entry of page.body.entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

/**
 * The RightRail live log: `GET /api/activity/page` walked backwards as an infinite
 * query. The first page is the newest entries; `fetchNextPage` pulls the next
 * (older) page via the opaque `nextCursor`. New entries arrive live over SSE and are
 * prepended (see {@link prependActivityEntry}) — no polling, no refetch.
 */
export function useActivityFeedInfiniteQuery() {
  return apiClient.activity.pageActivity.useInfiniteQuery<ActivityEntry[], string | undefined>({
    queryKey: getActivityFeedQueryKey(),
    queryData: ({ pageParam }) => ({
      query: { limit: PAGE_SIZE, ...(pageParam ? { before: pageParam } : {}) },
    }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage: ActivityPageResponse) => lastPage.body.nextCursor ?? undefined,
    select: selectActivityFeed,
  });
}

/**
 * Prepend a live SSE entry onto the loaded feed's first page (id-deduped). A no-op
 * until the feed has been fetched once — the first fetch already includes the entry.
 */
export function prependActivityEntry(qc: QueryClient, entry: ActivityEntry): void {
  qc.setQueryData<InfiniteData<ActivityPageResponse>>(getActivityFeedQueryKey(), (old) => {
    if (!old) return old;
    const [first, ...rest] = old.pages;
    if (!first) return old;
    if (old.pages.some((page) => page.body.entries.some((e) => e.id === entry.id))) return old;
    const merged: ActivityPageResponse = {
      ...first,
      body: { ...first.body, entries: [entry, ...first.body.entries] },
    };
    return { ...old, pages: [merged, ...rest] };
  });
}
