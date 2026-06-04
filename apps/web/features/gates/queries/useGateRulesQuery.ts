import type { GlobalGateRule } from "@zibby/contracts";
import { apiClient } from "../../../state/api";

/** Shared cache key for the global gate-rule catalog; exported so mutations invalidate it. */
export function getGateRulesQueryKey() {
  return ["gate-rules"] as const;
}

/**
 * The global gate-rule catalog (`GET /api/gate-rules`) — the ordered list backing
 * the "Pravidla schvalování" page. Returns the TanStack query result directly;
 * `select` unwraps the `{ rules }` envelope so `data` is the ordered `GlobalGateRule[]`.
 */
export function useGateRulesQuery() {
  return apiClient.gateRules.listGateRules.useQuery({
    queryKey: getGateRulesQueryKey(),
    select: (response: { body: { rules: GlobalGateRule[] } }) => response.body.rules,
  });
}
