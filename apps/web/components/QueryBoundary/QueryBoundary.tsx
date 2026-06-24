"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { QueryError } from "../LoadError/QueryError";
import { QueryLoading } from "../LoadingState/QueryLoading";

export interface QueryBoundaryProps<TData> {
  /** The result of a single `useQuery` call (return it directly — don't unwrap it). */
  query: UseQueryResult<TData>;
  /**
   * The success view. Pass a render function to receive the resolved (non-`undefined`)
   * data with full type-narrowing, or a plain node when the data isn't needed.
   */
  children: ReactNode | ((data: TData) => ReactNode);
}

/**
 * Wraps a single query in the standard honest load states so every surface reads the same:
 * a failed load shows {@link QueryError} (wired to the query's `refetch`), a pending load
 * shows {@link QueryLoading}, and only a settled-success load renders `children`. The
 * boundary itself touches no i18n strings — both states are pre-wired.
 *
 * Use the render-prop form to read the resolved data without an `undefined` guard:
 *
 * ```tsx
 * const query = useAgentsQuery();
 * return <QueryBoundary query={query}>{(agents) => <AgentList agents={agents} />}</QueryBoundary>;
 * ```
 *
 * Single-query only — a screen awaiting several queries gates each one (or nests
 * boundaries). A disabled query (`enabled: false`) stays pending, so it would render the
 * loader indefinitely; gate such queries at the call site rather than wrapping them.
 */
export function QueryBoundary<TData>({ query, children }: QueryBoundaryProps<TData>) {
  if (query.isError) {
    return <QueryError onRetry={() => void query.refetch()} />;
  }
  if (query.isPending) {
    return <QueryLoading />;
  }
  return typeof children === "function" ? children(query.data) : children;
}
