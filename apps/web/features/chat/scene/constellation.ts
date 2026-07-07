import type { Agent, Pin } from "@zibby/contracts";
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR, categoryColor } from "./tokens";
import type { SceneAgent } from "./sceneTypes";

/**
 * Project the live catalogs onto the roster the constellation renders. Two rules,
 * in order (TODO note "chat ui — constellation should primarily show pinned
 * agents/pipelines/chains, then prefer to show only agents with images"):
 *
 * 1. **Pinned first.** The operator's pinned agents/pipelines/chains lead the
 *    roster, in pin order — an explicit choice overrides everything below, so a
 *    pinned agent shows even without an avatar image.
 * 2. **Then prefer images.** The remaining slots are filled from the deduped agent
 *    catalog, but only with agents that carry an avatar image — an imageless agent
 *    is dropped rather than cluttering the orbit. The lone exception is a roster
 *    that would otherwise be empty (nothing pinned, no imaged agents): then the
 *    imageless agents fill in, so a bare catalog still gets a constellation instead
 *    of a void.
 *
 * The agent catalog ships several EN/CZ duplicates of the same role plus a parallel
 * "Delivery"-category pipeline set (see `apps/api/data-test/agents/*.md`); the
 * dedupe below collapses same-named entries to ONE per role and prefers the entry
 * filed under one of the 7 canonical categories over the "Delivery" duplicate — so
 * `Architekt`/`Kodér`/`Dokumentátor` keep their real category colour.
 *
 * Pure and deterministic (stable sort by id, stable pin order) so orbit parameters
 * assigned by index never reshuffle between renders.
 */

/** The 7 real categories from `_categories.json` — a "Delivery" duplicate loses to
 * one of these when two entries share a name. */
const CANONICAL_CATEGORIES = new Set(
  Object.keys(CATEGORY_COLORS).filter((name) => name !== "Delivery"),
);

/** A sensible ceiling so a bloated catalog never clutters the orbit. */
const MAX_AGENTS = 12;

/** Structural shape of a pipeline the constellation needs — a subset of the
 * dashboard's domain `Pipeline` (and the contract one), so callers can pass either
 * without a cast. */
export interface ConstellationPipeline {
  id: string;
  name?: string;
  avatar?: string;
}

/** Structural shape of a chain the constellation needs. Chains carry no avatar or
 * category, so a pinned chain always renders the initial-in-a-disc fallback. */
export interface ConstellationChain {
  id: string;
  name?: string;
}

export interface ConstellationInput {
  agents: readonly Agent[];
  pipelines?: readonly ConstellationPipeline[];
  chains?: readonly ConstellationChain[];
  pins?: readonly Pin[];
}

function isCanonical(agent: Agent): boolean {
  return agent.category !== undefined && CANONICAL_CATEGORIES.has(agent.category);
}

function agentToScene(agent: Agent): SceneAgent {
  return {
    id: agent.id,
    name: agent.name?.trim() || agent.id,
    specialty: agent.description?.trim() ?? "",
    category: agent.category ?? "",
    color: categoryColor(agent.category),
    ...(agent.avatar ? { avatar: agent.avatar } : {}),
  };
}

function pipelineToScene(pipeline: ConstellationPipeline): SceneAgent {
  return {
    id: pipeline.id,
    name: pipeline.name?.trim() || pipeline.id,
    specialty: "",
    category: "",
    color: DEFAULT_CATEGORY_COLOR,
    ...(pipeline.avatar ? { avatar: pipeline.avatar } : {}),
  };
}

function chainToScene(chain: ConstellationChain): SceneAgent {
  return {
    id: chain.id,
    name: chain.name?.trim() || chain.id,
    specialty: "",
    category: "",
    color: DEFAULT_CATEGORY_COLOR,
  };
}

/** Collapse the agent catalog by normalised name (keeping the most canonical of any
 * duplicates), then stable-sort by id so orbit params stay put across renders. */
function dedupeAgents(agents: readonly Agent[]): Agent[] {
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
  return [...byName.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildConstellation(input: ConstellationInput): SceneAgent[] {
  const { agents, pipelines = [], chains = [], pins = [] } = input;

  const dedupedAgents = dedupeAgents(agents);
  const agentById = new Map(dedupedAgents.map((a) => [a.id, a]));
  const pipelineById = new Map(pipelines.map((p) => [p.id, p]));
  const chainById = new Map(chains.map((c) => [c.id, c]));

  const roster: SceneAgent[] = [];
  const pinnedAgentIds = new Set<string>();
  const seenPins = new Set<string>();

  // 1. Pinned entities first, in pin order (an explicit choice — shown even without
  //    an image). A pin whose entity was deleted after pinning silently drops out.
  for (const pin of pins) {
    if (roster.length >= MAX_AGENTS) break;
    const pinKey = `${pin.kind}:${pin.id}`;
    if (seenPins.has(pinKey)) continue;
    seenPins.add(pinKey);

    if (pin.kind === "agent") {
      const agent = agentById.get(pin.id);
      if (!agent) continue;
      roster.push(agentToScene(agent));
      pinnedAgentIds.add(agent.id);
    } else if (pin.kind === "pipeline") {
      const pipeline = pipelineById.get(pin.id);
      if (!pipeline) continue;
      roster.push(pipelineToScene(pipeline));
    } else {
      const chain = chainById.get(pin.id);
      if (!chain) continue;
      roster.push(chainToScene(chain));
    }
  }

  // 2. Fill the rest from the catalog, preferring agents that carry an image.
  const unpinned = dedupedAgents.filter((a) => !pinnedAgentIds.has(a.id));
  for (const agent of unpinned) {
    if (roster.length >= MAX_AGENTS) break;
    if (!agent.avatar) continue;
    roster.push(agentToScene(agent));
  }

  // Fallback: nothing pinned and no imaged agents at all — show the imageless
  // roster so a bare catalog still renders a constellation rather than a void.
  if (roster.length === 0) {
    for (const agent of unpinned) {
      if (roster.length >= MAX_AGENTS) break;
      roster.push(agentToScene(agent));
    }
  }

  return roster;
}
