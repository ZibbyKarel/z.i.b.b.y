import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getProjectQueryKey(id: string) {
  return ["projects", id] as const;
}

/** Single project by id (`GET /api/projects/:id`). */
export function useProjectQuery(id: string) {
  return apiClient.projects.getProject.useQuery({
    queryKey: getProjectQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
  });
}
