import { redirect } from "next/navigation";

/**
 * `/runs` → `/activity/runs` (ZB-07, ROUTE-MAP §2, D-009). This shim already
 * existed pointing at `/archiv` (D17 — old `?run=` links baked into on-disk
 * transcript JSONL can't be rewritten); it now forwards straight to the ZibbyCorp
 * activity/runs route instead of bouncing through `/archiv`'s own redirect.
 */
export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  redirect(run ? `/activity/runs/${encodeURIComponent(run)}` : "/activity/runs");
}
