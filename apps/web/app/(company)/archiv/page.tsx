import { redirect } from "next/navigation";

/**
 * `/archiv` → `/activity/runs` (ZB-07, ROUTE-MAP §2, D-009). Kept as a page-level
 * redirect (not a static `next.config.mjs` rule) because `?run=<id>` deep links —
 * already baked into on-disk transcripts/vault notes — need to land on the run's
 * own detail route, `/activity/runs/<id>`, not just the bare list.
 */
export default async function ArchivPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  redirect(run ? `/activity/runs/${encodeURIComponent(run)}` : "/activity/runs");
}
