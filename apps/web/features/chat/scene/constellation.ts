import type { Agent } from "@zibby/contracts";
import { CATEGORY_COLORS, categoryColor } from "./tokens";
import type { SceneAgent } from "./sceneTypes";

/**
 * Project the live agent catalog (`GET /api/agents`) onto the deduped roster the
 * constellation renders. The seed data ships several EN/CZ duplicates of the same
 * role plus a parallel "Delivery"-category pipeline set (see
 * `apps/api/data-test/agents/*.md`); this collapses same-named entries to ONE per
 * role and prefers the entry filed under one of the 7 canonical categories (the
 * personal catalog) over the "Delivery" duplicate — so `Architekt`/`Kodér`/
 * `Dokumentátor` keep their real category colour instead of doubling up.
 *
 * Canonical display name = whatever the catalog stores (Czech in the seed, the
 * default locale). Pure and deterministic (stable sort by id) so orbit parameters
 * assigned by index never reshuffle between renders.
 */

/** The 7 real categories from `_categories.json` — a "Delivery" duplicate loses to
 * one of these when two entries share a name. */
const CANONICAL_CATEGORIES = new Set(
  Object.keys(CATEGORY_COLORS).filter((name) => name !== "Delivery"),
);

/** A sensible ceiling so a bloated catalog never clutters the orbit. */
const MAX_AGENTS = 12;

function isCanonical(agent: Agent): boolean {
  return agent.category !== undefined && CANONICAL_CATEGORIES.has(agent.category);
}

export function buildConstellation(agents: readonly Agent[]): SceneAgent[] {
  // Collapse by normalised name, keeping the "most canonical" of any duplicates.
  const byName = new Map<string, Agent>();
  for (const agent of agents) {
    const name = agent.name?.trim();
    if (!agent.id || !name) continue;
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, agent);
      continue;
    }
    // Prefer a canonical-category entry over a Delivery/uncategorised duplicate.
    if (!isCanonical(existing) && isCanonical(agent)) byName.set(key, agent);
  }

  return [...byName.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, MAX_AGENTS)
    .map((agent) => ({
      id: agent.id,
      name: agent.name?.trim() || agent.id,
      specialty: agent.description?.trim() ?? "",
      category: agent.category ?? "",
      color: categoryColor(agent.category),
    }));
}
