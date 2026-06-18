import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getProjectQueryKey(id: string) {
  return ["projects", id] as const;
}

/** Single project by id (`GET /api/projects/:id`). Pass `{ enabled: false }` to keep
 * the hook inert (e.g. the "new project" detail screen, which has no id yet). */
export function useProjectQuery(id: string, options?: { enabled?: boolean }) {
  return apiClient.projects.getProject.useQuery({
    queryKey: getProjectQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
    enabled: options?.enabled,
  });
}
