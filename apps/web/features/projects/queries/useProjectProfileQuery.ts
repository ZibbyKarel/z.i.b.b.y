import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getProjectProfileQueryKey(id: string) {
  return ["projects", id, "profile"] as const;
}

/** Operational profile for a project (`GET /api/projects/:id/profile`). */
export function useProjectProfileQuery(id: string) {
  return apiClient.projects.getProjectProfile.useQuery({
    queryKey: getProjectProfileQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
  });
}
