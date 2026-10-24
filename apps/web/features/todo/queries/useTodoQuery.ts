import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the TODO notes. Exported so mutations can invalidate it. */
export function getTodoQueryKey() {
  return ["todo"] as const;
}

/** The operator's TODO notes from `GET /api/todo` (oldest first); `data` is `{ items }`. */
export function useTodoQuery() {
  return apiClient.todo.listTodo.useQuery({
    queryKey: getTodoQueryKey(),
    select: selectApiResponseBody,
  });
}
