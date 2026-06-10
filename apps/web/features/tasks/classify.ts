import type { Agent } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";
import type { Pipeline } from "../../domain";
import type { TaskRouting, TaskTarget } from "./task";

/**
 * Fallback destination when the catalog is empty (queries still loading) or no
 * candidate scores at all — ZIBBY itself takes the task. Keeps the routing card
 * renderable so the approval gate never dead-ends.
 */
const FALLBACK_TARGET: TaskTarget = {
  kind: "agent",
  id: "zibby",
  name: "ZIBBY",
  glyph: "bot",
};

/** Lowercased word/number tokens, diacritics preserved. */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Distinct keyword tokens (length ≥ 3) drawn from a target's catalog strings. */
function keywordsOf(parts: Array<string | undefined>): string[] {
  const tokens = parts.flatMap((p) => (p ? tokenize(p) : []));
  return [...new Set(tokens.filter((t) => t.length >= 3))];
}

interface Scored {
  target: TaskTarget;
  score: number;
  matched: string[];
}

/** Turn the live catalog into rankable targets, then score each one. */
function scoreCandidates(
  haystack: Set<string>,
  agents: Agent[],
  pipelines: Pipeline[],
): Scored[] {
  const agentScored: Scored[] = agents.map((a) => {
    const target: TaskTarget = {
      kind: "agent",
      id: a.id,
      name: a.name ?? a.id,
      glyph: (a.glyph as IconName | undefined) ?? "bot",
      category: a.category,
    };
    const keywords = keywordsOf([target.name, a.id, a.category, a.description]);
    const matched = keywords.filter((k) => haystack.has(k));
    return { target, score: matched.length, matched };
  });

  const pipelineScored: Scored[] = pipelines.map((p) => {
    const target: TaskTarget = {
      kind: "pipeline",
      id: p.id,
      name: p.name,
      glyph: "flow",
    };
    // Pipelines describe a multi-agent flow, so their description carries most
    // of the routable signal; the phase agents add a few more terms.
    const keywords = keywordsOf([
      p.name,
      p.id,
      p.desc,
      ...p.phases.map((ph) => ph.agent),
    ]);
    const matched = keywords.filter((k) => haystack.has(k));
    return { target, score: matched.length, matched };
  });

  return [...agentScored, ...pipelineScored].sort((a, b) => b.score - a.score);
}

/**
 * Deterministic stand-in for the backend categorizer: ranks the live agent and
 * pipeline catalog against the task description (plus any extracted paths) and
 * returns the best target, a 0–1 confidence, the catalog terms that matched (the
 * routing rationale) and the full candidate list for manual override.
 *
 * No randomness — the same description always routes the same way, so the
 * approval gate is reproducible and testable.
 */
export function classifyTask(
  text: string,
  paths: string[],
  agents: Agent[],
  pipelines: Pipeline[],
): TaskRouting {
  // Path segments are strong routing hints ("…/media/…" → the media curator),
  // so they join the description in the term haystack.
  const haystack = new Set(tokenize([text, ...paths].join(" ")));
  const scored = scoreCandidates(haystack, agents, pipelines);
  const candidates = scored.map((s) => s.target);

  const best = scored[0];
  if (!best) {
    return { target: FALLBACK_TARGET, confidence: 0.22, matchedTerms: [], candidates: [FALLBACK_TARGET] };
  }

  const runnerUp = scored[1]?.score ?? 0;
  let confidence: number;
  if (best.score === 0) {
    // Nothing matched — surface the top catalog entry but flag it as a guess so
    // the gate steers the user to the manual picker.
    confidence = 0.22;
  } else {
    const separation = best.score - runnerUp;
    confidence = Math.min(0.95, 0.42 + 0.13 * best.score + 0.08 * separation);
  }

  return { target: best.target, confidence, matchedTerms: best.matched, candidates };
}
