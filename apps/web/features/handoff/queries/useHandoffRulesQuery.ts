import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the standing handoff-rule catalog; exported so mutations invalidate it. */
export function getHandoffRulesQueryKey() {
  return ["handoff-rules"] as const;
}

/**
 * The full handoff-rule catalog (`GET /api/handoff-rules`) — seeded system rules
 * plus operator-authored ones (P1, `docs/superpowers/specs/2026-07-22-subsystem-handoff-design.md`
 * Part A). Returns the TanStack query result directly; `select` unwraps the ts-rest
 * envelope so `data` is the bare `HandoffRule[]` body. Consumers (the subsystem
 * drawer's Předávání tab) filter this down to `from === subsystem.id` themselves —
 * this hook always returns the whole catalog.
 */
export function useHandoffRulesQuery() {
  return apiClient.handoff.getHandoffRules.useQuery({
    queryKey: getHandoffRulesQueryKey(),
    select: selectApiResponseBody,
  });
}
