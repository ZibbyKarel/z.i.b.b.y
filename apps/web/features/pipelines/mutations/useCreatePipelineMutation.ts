import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getPipelinesQueryKey } from "../queries/usePipelinesQuery";

/** Create a pipeline (`POST /api/pipelines`); refreshes the list on success. */
export function useCreatePipelineMutation() {
  const qc = useQueryClient();
  return apiClient.pipelines.createPipeline.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getPipelinesQueryKey() }),
  });
}
