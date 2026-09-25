import type { CommandPaletteEntry, CommandPaletteGroupKey } from "./types";

/** Every group in display order — `"actions"` always leads (D-014's "the
 * operator's own next move outranks anything the index merely found"). */
export const GROUP_ORDER: readonly CommandPaletteGroupKey[] = [
  "actions",
  "departments",
  "people",
  "tasks",
  "chains",
  "goals",
  "companies",
  "teams",
  "projects",
  "pipelines",
  "registries",
  "automations",
  "signals",
  "vault",
  "settings",
  "gates",
];

/** Case-insensitive substring match over label + meta — an empty query matches
 * everything (mirrors the deleted `ChatSearch.matchesQuery`). */
export function matchesQuery(query: string, entry: CommandPaletteEntry): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return entry.label.toLowerCase().includes(q) || (entry.meta?.toLowerCase().includes(q) ?? false);
}

/** Per-group cap on the rendered list — a runaway-guard, not a UX choice about
 * relevance ordering (each source hook already returns its own natural order). */
export const GROUP_CAP = 8;

/**
 * Filters `entries` by `query`, caps each group at {@link GROUP_CAP}, and buckets
 * the survivors into `GROUP_ORDER`'s fixed order. Groups that end up empty are
 * omitted — the DS `CommandPalette` itself also filters empty groups, but doing
 * it here keeps this module the single source of "what actually renders".
 */
export function groupAndFilterEntries(
  entries: CommandPaletteEntry[],
  query: string,
): Array<{ group: CommandPaletteGroupKey; entries: CommandPaletteEntry[] }> {
  const byGroup = new Map<CommandPaletteGroupKey, CommandPaletteEntry[]>();
  for (const entry of entries) {
    if (!matchesQuery(query, entry)) continue;
    const bucket = byGroup.get(entry.group);
    if (bucket) {
      if (bucket.length < GROUP_CAP) bucket.push(entry);
    } else {
      byGroup.set(entry.group, [entry]);
    }
  }
  return GROUP_ORDER.filter((group) => (byGroup.get(group)?.length ?? 0) > 0).map((group) => ({
    group,
    entries: byGroup.get(group) ?? [],
  }));
}
