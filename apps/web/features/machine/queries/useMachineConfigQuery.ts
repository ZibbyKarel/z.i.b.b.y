import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for THIS machine's per-machine config. Exported so the mutation can invalidate it. */
export function getMachineConfigQueryKey() {
  return ["machine-config"] as const;
}

/**
 * THIS machine's per-machine config from `GET /api/machine/config` (Phase 76) —
 * currently just `cloneRoot`, the local directory ZIBBY clones a project into
 * when it isn't already present at its canonical `path` on this machine. Never
 * synced (gitignored on disk) — every machine reads/writes only its own file.
 */
export function useMachineConfigQuery() {
  return apiClient.machine.getMachineConfig.useQuery({
    queryKey: getMachineConfigQueryKey(),
    select: selectApiResponseBody,
  });
}
