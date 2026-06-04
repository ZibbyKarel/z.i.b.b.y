import type { GateRule } from "@zibby/contracts";
import { apiClient } from "../../../state/api";

/** Shared cache key for the locked system policy floor. */
export function getSystemPolicyQueryKey() {
  return ["gates", "policy"] as const;
}

/** The locked system policy floor (`GET /api/gates/policy`) — `POLICY.md` rules. */
export function useSystemPolicyQuery() {
  return apiClient.gates.getSystemPolicy.useQuery({
    queryKey: getSystemPolicyQueryKey(),
    select: (response: { body: { rules: GateRule[] } }) => response.body.rules,
  });
}
