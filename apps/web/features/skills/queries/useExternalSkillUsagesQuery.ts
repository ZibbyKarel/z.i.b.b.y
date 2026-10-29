import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getExternalSkillUsagesQueryKey(id: string) {
  return ["skills", id, "usages"] as const;
}

/** Workflows whose phases use an external skill (`GET /api/skills/external/:id/usages`). */
export function useExternalSkillUsagesQuery(id: string) {
  return apiClient.externalSkills.externalSkillUsages.useQuery({
    queryKey: getExternalSkillUsagesQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
  });
}
