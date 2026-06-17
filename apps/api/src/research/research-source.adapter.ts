import type { ResearchSource } from "@zibby/contracts"

/**
 * A raw item as a source adapter yields it, BEFORE ranking. The adapter derives a
 * deterministic per-source `id` so a re-fetch of the same item collapses to the same
 * digest entry (dedup is a pure id-collision check, like the channel seam).
 */
export interface RawResearchItem {
  id: string
  title: string
  url?: string
  summary: string
  publishedAt?: string
}

/**
 * The research seam — one implementation per source kind (RSS/HN/PH/… real fetchers
 * are a deferred hardening; the fixtures-backed {@link FakeResearchAdapter} is the
 * floor today), mirroring the channel-adapter seam. No method may throw out of a
 * digest pass: a transient fetch failure yields `[]`, never an exception that drops
 * the other sources.
 */
export interface ResearchSourceAdapter {
  /** Fetch the current items for a source. Returns `[]` on any failure (never throws). */
  fetch(source: ResearchSource): Promise<RawResearchItem[]>
}
