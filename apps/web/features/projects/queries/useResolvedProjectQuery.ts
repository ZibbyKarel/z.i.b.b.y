import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getResolvedProjectQueryKey(id: string) {
  return ["projects", id, "resolved"] as const;
}

/**
 * A project's EFFECTIVE (company-merged) context (Phase 72) —
 * `GET /api/projects/:id/resolved`: the merged people/budget/integrations plus
 * which company (if any) they were merged from. Pass `{ enabled: false }` to
 * keep the hook inert when there is no project id yet (mirrors
 * `useProjectQuery`/`useProjectProfileQuery`).
 */
export function useResolvedProjectQuery(id: string, options?: { enabled?: boolean }) {
  return apiClient.projects.getResolvedProject.useQuery({
    queryKey: getResolvedProjectQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
    enabled: options?.enabled,
  });
}
