import type { Agent } from "@zibby/contracts";

/** Dominant terms considered when slugging an id / naming a candidate. */
const MAX_DOMINANT_TERMS = 4;
/** `AGENT_ID_REGEX` allows up to 128 chars; stay well under it. */
const MAX_ID_LEN = 60;
/** Sample task summaries folded into the candidate's instructions body. */
const MAX_SAMPLES_IN_INSTRUCTIONS = 5;

/**
 * One recurring `orchestrator-fallback` pattern (Phase 4a telemetry, grouped by
 * `AgentFactoryService.detect`): the shared normalized-summary key, a handful of
 * representative raw task summaries, the classifier-matched terms across the
 * group (most frequent first) and the occurrence count.
 */
export interface FallbackGroup {
  normalizedSummary: string;
  samples: readonly string[];
  terms: readonly string[];
  count: number;
}

/**
 * Slugify the group's dominant terms (or, absent any, its normalized summary)
 * into an `AGENT_ID_REGEX`-safe id, `auto-`-prefixed so a machine-generated
 * candidate never collides with a hand-authored agent's id namespace.
 */
export function candidateAgentId(group: Pick<FallbackGroup, "terms" | "normalizedSummary">): string {
  const dominant = group.terms.slice(0, MAX_DOMINANT_TERMS);
  const basis = dominant.length > 0 ? dominant.join("-") : group.normalizedSummary;
  const slug = basis
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ID_LEN - "auto-".length);
  return `auto-${slug || "task"}`;
}

/** Title-case a list of terms for a human-readable name (`"deploy staging"` → `"Deploy Staging"`). */
function titleCase(terms: readonly string[]): string {
  return terms.map((t) => (t.length > 0 ? t[0]?.toUpperCase() + t.slice(1) : t)).join(" ");
}

/**
 * Deterministic candidate-agent generator (Phase 4b) — no LLM call, fully unit
 * testable. `tools: ["read"]` is least-privilege by construction: a proposed
 * agent starts with the narrowest useful capability; the operator widens it
 * explicitly on activation if warranted. `category: "Proposed"` + `status:
 * "proposed"` keep it out of every dispatchable catalog until approved.
 */
export function generateCandidateAgent(group: FallbackGroup): Agent {
  const dominant = group.terms.slice(0, MAX_DOMINANT_TERMS);
  const label = dominant.length > 0 ? titleCase(dominant) : group.normalizedSummary;
  const samples = group.samples.slice(0, MAX_SAMPLES_IN_INSTRUCTIONS);
  const instructions = [
    `You handle tasks like the ones below — recurring work that fell through to the orchestrator (no dedicated agent matched confidently) ${group.count} times in the past 30 days.`,
    "",
    "Recurring task summaries this candidate was drafted from:",
    ...samples.map((s) => `- ${s}`),
    "",
    "You start read-only (least privilege); the operator can widen your tools once activated.",
  ].join("\n");

  return {
    id: candidateAgentId(group),
    name: `${label} Specialist`,
    description: `Proposed after ${group.count} orchestrator fallbacks matching "${group.normalizedSummary}" in the past 30 days.`,
    category: "Proposed",
    status: "proposed",
    tools: ["read"],
    instructions,
  };
}

/**
 * Coverage check (Phase 4b): a candidate is skipped when its dominant terms
 * already appear in an existing agent's name/description/category — simple
 * substring containment, no LLM. Checked against every existing agent
 * (proposed or active) so the Agent Factory never re-proposes a specialist
 * that's already been drafted or approved.
 */
export function isCoveredByExistingAgent(
  group: Pick<FallbackGroup, "terms">,
  agents: readonly Agent[],
): boolean {
  const dominant = group.terms.slice(0, MAX_DOMINANT_TERMS).map((t) => t.toLowerCase());
  if (dominant.length === 0) return false;
  return agents.some((agent) => {
    const haystack = [agent.name, agent.description, agent.category]
      .filter((v): v is string => Boolean(v))
      .join(" ")
      .toLowerCase();
    return haystack.length > 0 && dominant.some((term) => haystack.includes(term));
  });
}
