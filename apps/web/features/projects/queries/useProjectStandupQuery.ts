import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getProjectStandupQueryKey(id: string) {
  return ["projects", id, "standup"] as const;
}

/** Latest standup cheat sheet for a project (`GET /api/projects/:id/standup`). */
export function useProjectStandupQuery(id: string) {
  return apiClient.projects.getStandup.useQuery({
    queryKey: getProjectStandupQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
  });
}
