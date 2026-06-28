import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getPipelinesQueryKey } from "../queries/usePipelinesQuery";

/** Partially update a pipeline (`PATCH /api/pipelines/:id`); refreshes the list. */
export const useUpdatePipelineMutation = makeInvalidatingMutation(
  apiClient.pipelines.updatePipeline.useMutation,
  getPipelinesQueryKey,
);
