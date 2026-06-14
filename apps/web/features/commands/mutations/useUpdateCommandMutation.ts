import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getCommandsQueryKey } from "../queries/useCommandsQuery";
import { getCommandQueryKey } from "../queries/useCommandQuery";

/** Update a command (`PATCH /api/commands/:id`); refreshes the list + the single command. */
export function useUpdateCommandMutation() {
  const qc = useQueryClient();
  return apiClient.commands.updateCommand.useMutation({
    onSuccess: (_data, { params: { id } }) => {
      qc.invalidateQueries({ queryKey: getCommandsQueryKey() });
      qc.invalidateQueries({ queryKey: getCommandQueryKey(id) });
    },
  });
}
