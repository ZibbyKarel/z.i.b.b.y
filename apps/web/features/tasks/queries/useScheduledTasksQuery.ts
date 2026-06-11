import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the deferred-task queue. */
export function getScheduledTasksQueryKey() {
  return ["tasks", "scheduled"] as const;
}

/**
 * The deferred-task queue (`GET /api/tasks/scheduled`). Returns the TanStack query
 * result directly; `select` strips the ts-rest envelope so `data` is the contract
 * `ScheduledTask[]` once a fetch lands. Call sites supply their own default
 * (`data ?? []`).
 */
export function useScheduledTasksQuery() {
  return apiClient.tasks.listScheduledTasks.useQuery({
    queryKey: getScheduledTasksQueryKey(),
    select: selectApiResponseBody,
  });
}
