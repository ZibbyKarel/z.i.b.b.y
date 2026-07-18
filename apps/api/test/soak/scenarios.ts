import type { ChannelItemState, IntegrationKind } from "@zibby/contracts";

/**
 * NS2 F6b — one scripted soak scenario: a fixture message seeded into the fake
 * channel dir plus the tier/state the autonomous loop MUST land it at. The texts
 * are tuned to the deterministic `KeywordTriager` (the e2e lane's triage path —
 * `CLAUDE_BIN` is the token-free fake, so the keyword fallback always produces
 * the verdict), which keeps the whole soak reproducible with no network and no
 * tokens.
 */
export interface SoakScenario {
  /** Stable scenario name (also the fixture file stem). */
  name: string;
  integrationId: string;
  kind: IntegrationKind;
  text: string;
  expect: {
    tier: 1 | 2 | 3;
    state: ChannelItemState;
    /** A reply must (true) / must not (false) have been sent. */
    replied: boolean;
    /** A kind-"channel" approval must (true) / must not (false) have been parked. */
    parked: boolean;
  };
}

/**
 * The scripted soak fleet. Covers the whole tier fan-out plus the two structural
 * safety cases: email may NEVER produce a reply or an approval (Never list), and
 * a graduated `(channel, category)` pair auto-sends THROUGH the gate (F6a).
 *
 * - `tier1-bug` — BUG_RE match → dispatch a delivery task (silent).
 * - `tier2-question` — QUESTION_RE match + reply mandate ON → auto-send.
 * - `tier3-request` — SCOPE_RE match → park a channel approval.
 * - `email-actionable` — QUESTION_RE match on an email → surfaced ONLY.
 * - `graduated-request` — SCOPE_RE match on a channel graduated for `request`
 *   → promoted to Tier-2 and auto-sent (the F6a path; the gate still ran).
 * - `low-confidence-other` — no signal → keyword terminal rule (tier 3, 0.3)
 *   → parked for the operator; the graduation floor must NOT promote it.
 */
export const SOAK_SCENARIOS: readonly SoakScenario[] = [
  {
    name: "tier1-bug",
    integrationId: "team",
    kind: "slack",
    text: "The soak build crashes with a stack trace right after login",
    expect: { tier: 1, state: "handled", replied: false, parked: false },
  },
  {
    name: "tier2-question",
    integrationId: "team",
    kind: "slack",
    text: "Can you share the current soak delivery status with the client team",
    expect: { tier: 2, state: "handled", replied: true, parked: false },
  },
  {
    name: "tier3-request",
    integrationId: "team",
    kind: "slack",
    text: "Posílám novou nabídku a smlouvu, deadline je příští týden",
    expect: { tier: 3, state: "triaged", replied: false, parked: true },
  },
  {
    name: "email-actionable",
    integrationId: "support",
    kind: "email",
    text: "Can you send over the latest soak progress summary please",
    expect: { tier: 2, state: "triaged", replied: false, parked: false },
  },
  {
    name: "graduated-request",
    integrationId: "announcements",
    kind: "slack",
    text: "Klient žádá o novou cenovou nabídku pro rozšířený rozsah projektu",
    // The raw keyword verdict is Tier-3 `request`; the seeded graduation promotes
    // it to Tier-2 and the reply auto-sends (through the gate — F6a invariant c).
    expect: { tier: 2, state: "handled", replied: true, parked: false },
  },
  {
    name: "low-confidence-other",
    integrationId: "team",
    kind: "slack",
    text: "Soak filler line with no classifiable signal in it",
    expect: { tier: 3, state: "triaged", replied: false, parked: true },
  },
];
