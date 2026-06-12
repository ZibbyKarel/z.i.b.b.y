import { Injectable } from "@nestjs/common"
import type { TriageVerdict } from "@zibby/contracts"
import type { TriageInput, TriageRouter } from "./triage-router"

/** A stack-trace / error / bug report → actionable, Tier 1 investigate. */
const BUG_RE =
  /\b(bug|crash(?:es|ed|ing)?|error|exception|stack ?trace|traceback|nullpointer|undefined is not|rozbit\w*|nefunguje|spadl\w*|chyba)\b/i
/** Scope / commercial / commitment words → Tier 3, a decision that commits the operator. */
const SCOPE_RE =
  /\b(nab[íi]dk\w*|smlouv\w*|deadline|scope|rozsah|cena|price|pricing|quote|invoice|faktur\w*|contract|termín|milestone|estimate)\b/i
/** Interrogative shapes → Tier 2 question. */
const QUESTION_RE =
  /(\?|\b(jak|kdy|pro[čc]|m[ůu][žz]e\w*|could you|can you|would you|what|when|why|how|where|is it|are you)\b)/i

/**
 * Deterministic triager — the always-available fallback behind the `claude -p`
 * triager. Pure regex heuristics, so the e2e suite stays token-free and stable.
 * Its terminal rule is the precise dual of the classifier's orchestrator rule:
 * anything it can't classify is treated as ACTIONABLE at TIER 3 with low
 * confidence — "unknown → higher tier" — never silently dropped.
 */
@Injectable()
export class KeywordTriager implements TriageRouter {
  triage(input: TriageInput): Promise<TriageVerdict | null> {
    return Promise.resolve(this.score(input.text))
  }

  /** Synchronous core — the unit tests call this directly. */
  score(text: string): TriageVerdict {
    if (BUG_RE.test(text)) {
      return {
        actionable: true,
        tier: 1,
        category: "bug",
        suggestedTaskText:
          "A bug was reported via an inbound channel. Investigate it on a branch and prepare a fix.",
        confidence: 0.8,
        reason: "Matched a bug/error/stack-trace signal.",
      }
    }
    if (SCOPE_RE.test(text)) {
      return {
        actionable: true,
        tier: 3,
        category: "request",
        suggestedReply: "Thanks for the details — I'll review and get back to you shortly.",
        confidence: 0.6,
        reason: "Matched scope/commercial/commitment terms — a decision that commits the operator.",
      }
    }
    if (QUESTION_RE.test(text)) {
      return {
        actionable: true,
        tier: 2,
        category: "question",
        suggestedReply: "Thanks for reaching out — here's where things stand.",
        confidence: 0.7,
        reason: "Matched an interrogative shape.",
      }
    }
    // Terminal rule: unclassifiable → actionable, Tier 3, low confidence (higher tier).
    return {
      actionable: true,
      tier: 3,
      category: "other",
      confidence: 0.3,
      reason: "No confident signal — defaulting to the higher tier for human review.",
    }
  }
}
