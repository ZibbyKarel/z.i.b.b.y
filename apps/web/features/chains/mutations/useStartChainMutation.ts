import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getChainRunsQueryKey } from "../queries/keys";

/** Start a chain run (`POST /api/chains/:id/run`); refreshes the runs list. */
export const useStartChainMutation = makeInvalidatingMutation(
  apiClient.chainRuns.startChain.useMutation,
  getChainRunsQueryKey,
);
