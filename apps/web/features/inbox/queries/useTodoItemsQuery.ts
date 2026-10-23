import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the cross-project TODO list (open manual roadmap tasks). */
export function getTodoItemsQueryKey() {
  return ["inbox", "todo"] as const;
}

/**
 * Every project's open manual, task-level roadmap items (`GET /api/roadmap/todo`) —
 * the Bridge TODO widget's list, newest first. `data` is the `TodoItemsResponse`
 * body (`items`). Creating or playing a roadmap item invalidates it.
 */
export function useTodoItemsQuery() {
  return apiClient.inbox.listTodoItems.useQuery({
    queryKey: getTodoItemsQueryKey(),
    select: selectApiResponseBody,
  });
}
