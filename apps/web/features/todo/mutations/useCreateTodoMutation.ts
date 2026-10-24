import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getTodoQueryKey } from "../queries/useTodoQuery";

/** Add a TODO note (`POST /api/todo`); refreshes the list. */
export function useCreateTodoMutation() {
  const qc = useQueryClient();
  return apiClient.todo.createTodo.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getTodoQueryKey() });
    },
  });
}
