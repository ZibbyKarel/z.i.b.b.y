import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRunningAgentsQueryKey } from "../../agents/queries/keys";
import { allTaskRunsKey } from "../../runs/queries/keys";
import { getScheduledTasksQueryKey } from "../../tasks/queries/useScheduledTasksQuery";
import { getSignalKindsQueryKey } from "../queries/useSignalKindsQuery";

/**
 * Register a new operator-authored signal kind (`POST /api/handoff-signal-kinds`,
 * B3b create flow — `docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md`
 * §"Slot B → B3"). The server mints the id (slugified `label`), forces
 * `status: "pending"`, and spawns a Forge build task to implement the emit —
 * so besides the registry list, this also invalidates the same task/runs-feed
 * keys {@link useCreateTaskMutation} does, so the spawned build task surfaces
 * in the unified runs feed the moment the caller navigates there.
 */
export function useCreateSignalKindMutation() {
  const qc = useQueryClient();
  return apiClient.handoff.createSignalKind.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getSignalKindsQueryKey() });
      void qc.invalidateQueries({ queryKey: allTaskRunsKey });
      void qc.invalidateQueries({ queryKey: getRunningAgentsQueryKey() });
      void qc.invalidateQueries({ queryKey: getScheduledTasksQueryKey() });
    },
  });
}
