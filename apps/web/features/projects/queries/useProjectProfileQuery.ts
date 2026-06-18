import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getProjectProfileQueryKey(id: string) {
  return ["projects", id, "profile"] as const;
}

/** Operational profile for a project (`GET /api/projects/:id/profile`). Pass
 * `{ enabled: false }` to keep the hook inert when there is no project id yet. */
export function useProjectProfileQuery(id: string, options?: { enabled?: boolean }) {
  return apiClient.projects.getProjectProfile.useQuery({
    queryKey: getProjectProfileQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
    enabled: options?.enabled,
  });
}
