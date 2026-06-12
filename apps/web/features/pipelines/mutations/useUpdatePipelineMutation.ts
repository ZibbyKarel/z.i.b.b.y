import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getPipelinesQueryKey } from "../queries/usePipelinesQuery";

/** Partially update a pipeline (`PATCH /api/pipelines/:id`); refreshes the list. */
export function useUpdatePipelineMutation() {
  const qc = useQueryClient();
  return apiClient.pipelines.updatePipeline.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getPipelinesQueryKey() }),
  });
}
