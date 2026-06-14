import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getSkillQueryKey(id: string) {
  return ["skills", id] as const;
}

/**
 * A single skill with its full body (`GET /api/skills/:id`) — the list query omits
 * `instructions`, so the edit modal fetches the whole skill here. Enabled only when
 * a skill is selected for editing.
 */
export function useSkillQuery(id: string | null) {
  return apiClient.skills.getSkill.useQuery({
    queryKey: getSkillQueryKey(id ?? "none"),
    queryData: { params: { id: id ?? "" } },
    enabled: id !== null,
    select: selectApiResponseBody,
  });
}
