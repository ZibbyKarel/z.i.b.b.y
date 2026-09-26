import type { ReviewRule } from "@zibby/contracts";
import { useQueries } from "@tanstack/react-query";
import { API_URL } from "../../../state/api";
import { getReviewRulesQueryKey } from "./useReviewRulesQuery";

async function fetchScope(scope: string): Promise<ReviewRule[]> {
  const res = await fetch(`${API_URL}/api/review-rules?scope=${encodeURIComponent(scope)}`);
  if (!res.ok) return [];
  return (await res.json()) as ReviewRule[];
}

/** A rule plus the scope KEY its `promote` call needs (the query it came
 *  from) — distinct from `rule.scope`, which is `"project" | "global"` (the
 *  grounding kind, not the store file). */
export interface ScopedReviewRule extends ReviewRule {
  scopeKey: string;
}

/**
 * `/policy/patterns` needs every project's rules PLUS `_global` flattened into
 * one list (the contract only lists one scope at a time, no "all" route) —
 * `useQueries` fans one GET out per scope, each independently cached under
 * {@link getReviewRulesQueryKey}. A plain `fetch` (not the ts-rest hook) because
 * `useQueries` needs a fixed-shape array of query configs, not N conditional
 * hook calls.
 */
export function useReviewRulesAllScopesQuery(scopes: readonly string[]) {
  const results = useQueries({
    queries: scopes.map((scope) => ({
      queryKey: getReviewRulesQueryKey(scope),
      queryFn: () => fetchScope(scope),
    })),
  });
  const data: ScopedReviewRule[] = results.flatMap((r, i) =>
    (r.data ?? []).map((rule) => ({ ...rule, scopeKey: scopes[i]! })),
  );
  return {
    data,
    isPending: results.some((r) => r.isPending),
    isError: results.some((r) => r.isError),
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}
