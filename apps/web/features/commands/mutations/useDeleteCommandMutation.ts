import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getCommandsQueryKey } from "../queries/useCommandsQuery";

/** Delete a command (`DELETE /api/commands/:id`); refreshes the catalog on success. */
export const useDeleteCommandMutation = makeInvalidatingMutation(
  apiClient.commands.deleteCommand.useMutation,
  getCommandsQueryKey,
);
