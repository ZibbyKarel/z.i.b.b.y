import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectLocalStateQueryKeyPrefix } from "../../projects/queries/useProjectLocalStateQuery";
import { getMachineConfigQueryKey } from "../queries/useMachineConfigQuery";

/**
 * Patch THIS machine's per-machine config (`PUT /api/machine/config`, Phase 76).
 * Refreshes the config itself, plus every project's cached local-state readout
 * (`["project-local-state", id]`) — changing the clone root changes what this
 * machine resolves a project to, so a stale "present"/"absent" readout would
 * otherwise linger until its next natural refetch.
 */
export function useUpdateMachineConfigMutation() {
  const qc = useQueryClient();
  return apiClient.machine.updateMachineConfig.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getMachineConfigQueryKey() });
      void qc.invalidateQueries({ queryKey: getProjectLocalStateQueryKeyPrefix() });
    },
  });
}
