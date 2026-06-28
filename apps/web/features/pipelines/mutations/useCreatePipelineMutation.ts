import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getPipelinesQueryKey } from "../queries/usePipelinesQuery";

/** Create a pipeline (`POST /api/pipelines`); refreshes the list on success. */
export const useCreatePipelineMutation = makeInvalidatingMutation(
  apiClient.pipelines.createPipeline.useMutation,
  getPipelinesQueryKey,
);
