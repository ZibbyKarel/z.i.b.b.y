import { Injectable } from "@nestjs/common";
import type { ClassifyTaskInput, TaskRouting } from "@zibby/contracts";
import { type RoutableTarget, type TaskRouter, toTaskTarget } from "./task-router";

/** Lowercased word/number tokens, diacritics preserved. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Lowercase + strip diacritics so "dokud nepro­jde" matches unaccented interim text. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Phase 11 loop cues (cs + en), diacritics-folded. Each is a substring probe over
 * the folded task text — a deterministic signal that the operator asked to
 * iterate-until-satisfied, so the classifier proposes a loop (a goal) rather than a
 * one-shot dispatch. This is the always-available leg behind the LLM router's own
 * `loop` annotation; either firing flips the verdict to `mode: "loop"`.
 */
const LOOP_CUES: readonly string[] = [
  // Czech
  "dokud", // "until" — the canonical cs cue ("dokud neprojde/nebude zelená")
  "opakuj", // "repeat"
  "znovu a znovu", // "again and again"
  // English
  "until it passes",
  "until it's green",
  "until its green",
  "until green",
  "until tests pass",
  "until the tests pass",
  "until it succeeds",
  "until it works",
  "keep going until",
  "keep trying until",
  "keep retrying",
  "retry until",
];

/**
 * True when the task text carries a loop cue — the deterministic loop leg. Pure
 * string work (fold + substring), no I/O or randomness, so the classifier stays
 * reproducible and the e2e suite never depends on the LLM router. Treats the input
 * as data (Law 4): a cue only flips the execution shape, it never names an action.
 */
export function detectLoopCue(text: string): boolean {
  const folded = fold(text);
  return LOOP_CUES.some((cue) => folded.includes(cue));
}

/** Distinct keyword tokens (length ≥ 3) drawn from a target's catalog blob. */
function keywordsOf(text: string): string[] {
  return [...new Set(tokenize(text).filter((token) => token.length >= 3))];
}

interface Scored {
  candidate: RoutableTarget;
  score: number;
  matched: string[];
}

/**
 * Deterministic keyword router — the always-available fallback behind the LLM
 * categorizer. Ranks the candidate catalog against the task description (plus any
 * extracted paths) by matched-term count, and reports a 0–1 confidence, the terms
 * that matched (the rationale), and a short reason. No randomness or I/O, so the
 * endpoint never hard-fails and the e2e suite stays fully deterministic.
 *
 * Ported verbatim from the web client's former `classifyTask`, so the scoring and
 * confidence curve are unchanged — only the catalog now lives server-side.
 */
@Injectable()
export class KeywordScorer implements TaskRouter {
  route(input: ClassifyTaskInput, candidates: RoutableTarget[]): Promise<TaskRouting | null> {
    return Promise.resolve(this.score(input, candidates));
  }

  /** Synchronous core — the e2e and unit tests call this directly. */
  score(input: ClassifyTaskInput, candidates: RoutableTarget[]): TaskRouting | null {
    if (candidates.length === 0) return null;

    // Path segments are strong routing hints ("…/media/…" → the media curator),
    // so they join the description in the term haystack.
    const haystack = new Set(tokenize([input.text, ...(input.paths ?? [])].join(" ")));
    const scored: Scored[] = candidates
      .map((candidate) => {
        const keywords = keywordsOf(candidate.search);
        const matched = keywords.filter((keyword) => haystack.has(keyword));
        return { candidate, score: matched.length, matched };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best) return null;
    const wire = candidates.map(toTaskTarget);

    const runnerUp = scored[1]?.score ?? 0;
    let confidence: number;
    if (best.score === 0) {
      // Nothing matched — surface the top entry but flag it as a guess so the gate
      // steers the user to the manual picker.
      confidence = 0.22;
    } else {
      const separation = best.score - runnerUp;
      confidence = Math.min(0.95, 0.42 + 0.13 * best.score + 0.08 * separation);
    }

    const reason =
      best.matched.length > 0
        ? `Matched catalog terms: ${best.matched.join(", ")}`
        : "Best available match — low confidence, please confirm or pick manually.";

    return {
      target: toTaskTarget(best.candidate),
      confidence,
      reason,
      matchedTerms: best.matched,
      candidates: wire,
      // Phase 11: the scorer ranks the maker only; mode + proposedGoal + paths are
      // overlaid by the classifier (it owns the loop-cue check and path resolution).
      mode: "single",
      proposedGoal: null,
      paths: [],
    };
  }
}
