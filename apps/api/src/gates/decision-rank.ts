import type { Decision } from "@zibby/contracts";

/**
 * Strength ordering: a higher rank is a stricter decision. Shared by the evaluator
 * (own-vs-floor precedence at eval time, {@link GateEvaluatorService}) and the
 * policy floor's disk/canonical merge ({@link PolicyStorageService}) — pulled out to
 * its own module so neither has to import the other (which would cycle, since the
 * evaluator already depends on the policy storage service).
 */
export const DECISION_RANK: Record<Decision, number> = { allow: 0, notify: 1, ask: 2, deny: 3 };
