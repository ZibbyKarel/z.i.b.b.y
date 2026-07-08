import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Cache-key prefix for the whole local-state family (no id) — invalidate this to
 * bust every project's cached readout at once (e.g. when the machine's clone
 * root changes — see `useUpdateMachineConfigMutation`).
 */
export function getProjectLocalStateQueryKeyPrefix() {
  return ["project-local-state"] as const;
}

export function getProjectLocalStateQueryKey(id: string) {
  return [...getProjectLocalStateQueryKeyPrefix(), id] as const;
}

/**
 * THIS machine's local-clone resolution for a project (`GET
 * /api/projects/:id/local-state`, Phase 76) — whether `project.path` (or a prior
 * `cloneRoot` copy) is actually present on this machine, so the detail screen can
 * offer a clone action when neither resolves. Pass `{ enabled: false }` to keep
 * the hook inert (e.g. the "new project" detail screen, which has no id yet).
 */
export function useProjectLocalStateQuery(id: string, options?: { enabled?: boolean }) {
  return apiClient.projects.getProjectLocalState.useQuery({
    queryKey: getProjectLocalStateQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
    enabled: options?.enabled,
  });
}
