import type { ResearchItem, ResearchSource } from "@zibby/contracts";
import type { RawResearchItem } from "./research-source.adapter";

/** Lower-case, strip punctuation to spaces — shared by interest + item normalisation. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]+/g, " ");
}

/**
 * Score one item against the operator's interests: the fraction of distinct interest
 * terms that appear (as whole words / substrings) in the item's title+summary, in
 * [0,1]. With no interests configured every item scores a neutral 0.5 (the operator
 * watches sources but hasn't narrowed by topic) so the digest isn't empty.
 */
export function relevanceOf(
  item: RawResearchItem,
  interests: string[],
): { relevance: number; matchedInterests: string[] } {
  if (interests.length === 0) return { relevance: 0.5, matchedInterests: [] };
  const haystack = normalize(`${item.title} ${item.summary}`);
  const matched = interests.filter((interest) => haystack.includes(normalize(interest).trim()));
  return { relevance: matched.length / interests.length, matchedInterests: matched };
}

/**
 * Rank a source's raw items into scored {@link ResearchItem}s, drop zero-relevance
 * items (noise the operator didn't ask for), and sort by relevance desc then title.
 * Pure — the snapshot-testable core of the digest pass.
 */
export function rankSourceItems(
  source: ResearchSource,
  raw: RawResearchItem[],
  interests: string[],
): ResearchItem[] {
  return raw
    .map((item): ResearchItem => {
      const { relevance, matchedInterests } = relevanceOf(item, interests);
      return {
        id: item.id,
        title: item.title,
        ...(item.url ? { url: item.url } : {}),
        summary: item.summary,
        source: source.kind,
        sourceId: source.id,
        relevance,
        matchedInterests,
        ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
      };
    })
    .filter((item) => item.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || a.title.localeCompare(b.title));
}
