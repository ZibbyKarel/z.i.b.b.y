import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getCommandsQueryKey } from "../queries/useCommandsQuery";

/** Delete a command (`DELETE /api/commands/:id`); refreshes the catalog on success. */
export function useDeleteCommandMutation() {
  const qc = useQueryClient();
  return apiClient.commands.deleteCommand.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getCommandsQueryKey() }),
  });
}
