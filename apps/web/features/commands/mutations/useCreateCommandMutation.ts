import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getCommandsQueryKey } from "../queries/useCommandsQuery";

/** Create a command (`POST /api/commands`); refreshes the catalog on success. */
export function useCreateCommandMutation() {
  const qc = useQueryClient();
  return apiClient.commands.createCommand.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getCommandsQueryKey() }),
  });
}
