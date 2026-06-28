import { useQueryClient } from "@tanstack/react-query";

/** A ts-rest route mutation hook narrowed to the one option we set: `onSuccess`. */
type RouteUseMutation<TResult> = (options: { onSuccess: () => void }) => TResult;

/**
 * Build a mutation hook whose only success side effect is invalidating one
 * query-key family — the shape ~40 of our CRUD mutations share verbatim
 * (`const qc = useQueryClient(); return route.useMutation({ onSuccess: () =>
 * qc.invalidateQueries({ queryKey }) })`).
 *
 * `useRouteMutation` is a ts-rest route hook (e.g.
 * `apiClient.agents.createAgent.useMutation`) — safe to pass by reference since
 * each is a standalone closure, not a `this`-bound method. The returned hook
 * returns the `useMutation` result directly, per the mutation convention in
 * CLAUDE.md, so call sites are unchanged.
 *
 * @example
 * export const useCreateAgentMutation = makeInvalidatingMutation(
 *   apiClient.agents.createAgent.useMutation,
 *   getAgentsQueryKey,
 * );
 */
export function makeInvalidatingMutation<TResult>(
  useRouteMutation: RouteUseMutation<TResult>,
  getKey: () => readonly unknown[],
): () => TResult {
  return function useInvalidatingMutation(): TResult {
    const queryClient = useQueryClient();
    return useRouteMutation({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getKey() });
      },
    });
  };
}
