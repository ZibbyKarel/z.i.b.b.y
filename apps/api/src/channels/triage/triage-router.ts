import type { TriageVerdict } from "@zibby/contracts"

/** What the triager sees: the sanitized item text plus a short mandate summary. */
export interface TriageInput {
  /** The sanitized inbound text (the triager envelopes it before any prompt). */
  text: string
  /** A one-line mandate summary, for the Claude triager's context only. */
  mandate?: string
}

/**
 * Picks a {@link TriageVerdict} for an inbound item. Two implementations share the
 * seam (mirroring the task classifier): the `claude -p` triager (AI) and the
 * deterministic keyword triager (always-available fallback). Returns `null` when it
 * can't produce a confident, well-formed, schema-valid verdict — the service then
 * falls back to the keyword triager, which never returns null.
 */
export interface TriageRouter {
  triage(input: TriageInput): Promise<TriageVerdict | null>
}

/** DI token for the primary {@link TriageRouter} (the LLM triager in production). */
export const TRIAGE_ROUTER = Symbol("TRIAGE_ROUTER")
