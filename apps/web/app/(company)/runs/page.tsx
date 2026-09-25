import { redirect } from "next/navigation";

/**
 * `/runs` is deleted (F8d) — `/archiv` (F2) replaced it as the task archive. This
 * stays a redirect shim rather than a hard delete (D17, `docs/hud2chat/DECISIONS.md`):
 * `apps/api`'s `chat-session.service.ts` used to bake `href: /runs?run=<ref>` into
 * every `create_task` chat-turn's tool event, and those events are already
 * PERSISTED in transcript JSONL on disk — no frontend change rewrites history
 * already written. The API itself is repointed at `/archiv` in this same phase, so
 * no NEW `/runs` links are minted going forward, but old transcripts still carry
 * them, and this preserves `?run=` so a deep link from one still lands on the
 * right run.
 *
 * Remove this shim only once every transcript old enough to carry a bare `/runs` or
 * `/runs?run=` link has aged out — there is no retention policy yet that guarantees
 * this, so check for one before deleting.
 */
export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  redirect(run ? `/archiv?run=${encodeURIComponent(run)}` : "/archiv");
}
