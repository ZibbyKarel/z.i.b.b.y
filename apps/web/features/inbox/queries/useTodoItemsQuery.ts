import { MINUTE_MS } from "../../../utils/time";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the cross-project TODO list (open manual roadmap tasks). */
export function getTodoItemsQueryKey() {
  return ["inbox", "todo"] as const;
}

/**
 * Every project's open manual, task-level roadmap items (`GET /api/roadmap/todo`) —
 * the Bridge TODO widget's list, newest first. `data` is the `TodoItemsResponse`
 * body (`items`). Creating or playing a roadmap item invalidates it, and so do the
 * roadmap activity events (RunEventsProvider); the 15-min poll catches the rest
 * (items added in another tab, edits outside ZIBBY).
 */
export function useTodoItemsQuery() {
  return apiClient.inbox.listTodoItems.useQuery({
    queryKey: getTodoItemsQueryKey(),
    select: selectApiResponseBody,
    refetchInterval: 15 * MINUTE_MS,
  });
}
