import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getCommandsQueryKey } from "../queries/useCommandsQuery";

/** Create a command (`POST /api/commands`); refreshes the catalog on success. */
export const useCreateCommandMutation = makeInvalidatingMutation(
  apiClient.commands.createCommand.useMutation,
  getCommandsQueryKey,
);
