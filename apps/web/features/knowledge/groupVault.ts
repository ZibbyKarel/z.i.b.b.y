import type { DepartmentId, MemoryGraph, MemoryTier } from "@zibby/contracts";

/** Vault nav order (O-24): curated memory first, then thematic knowledge, then
 *  the episodic daily log — matches the pre-existing tier-filter chip order. */
export const VAULT_TIERS: readonly MemoryTier[] = ["memory", "knowledge", "daily"];

/** A department's shelf within one tier, or the `null`-department "general" shelf. */
export interface VaultShelf {
  department: DepartmentId | null;
  notes: ReadonlyArray<{ id: string; label: string }>;
}

export interface VaultTierGroup {
  tier: MemoryTier;
  shelves: readonly VaultShelf[];
}

/**
 * Group the memory graph's nodes into the real model (O-24): tier → department
 * shelf. `visibleIds`, when given, additionally restricts which notes appear
 * (the vault's search box) without changing the grouping itself. Empty shelves
 * and empty tiers are dropped. Pure — unit-tested directly.
 */
export function groupVaultNodes(
  nodes: MemoryGraph["nodes"],
  visibleIds?: ReadonlySet<string>,
): VaultTierGroup[] {
  return VAULT_TIERS.map((tier) => {
    const tierNodes = nodes.filter((n) => n.tier === tier && (!visibleIds || visibleIds.has(n.id)));
    const byDept = new Map<DepartmentId | null, { id: string; label: string }[]>();
    for (const n of tierNodes) {
      const key = n.department ?? null;
      const list = byDept.get(key) ?? [];
      list.push({ id: n.id, label: n.label });
      byDept.set(key, list);
    }
    const shelves = [...byDept.entries()]
      // The general (no-department) shelf sorts last, after every named department.
      .sort(([a], [b]) => {
        if (a === null) return b === null ? 0 : 1;
        if (b === null) return -1;
        return a.localeCompare(b);
      })
      .map(([department, notes]) => ({
        department,
        notes: notes.sort((a, b) => a.label.localeCompare(b.label)),
      }));
    return { tier, shelves };
  }).filter((g) => g.shelves.length > 0);
}
