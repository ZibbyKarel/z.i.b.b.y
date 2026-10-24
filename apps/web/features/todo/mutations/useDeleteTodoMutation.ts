import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getTodoQueryKey } from "../queries/useTodoQuery";

/** Delete a TODO note (`DELETE /api/todo/:id`); refreshes the list. */
export function useDeleteTodoMutation() {
  const qc = useQueryClient();
  return apiClient.todo.deleteTodo.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getTodoQueryKey() });
    },
  });
}
