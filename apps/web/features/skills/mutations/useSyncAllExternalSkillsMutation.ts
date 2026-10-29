import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getSkillsQueryKey } from "../queries/useSkillsQuery";

/** Check every external skill for upstream changes (`POST /api/skills/external/sync`). */
export const useSyncAllExternalSkillsMutation = makeInvalidatingMutation(
  apiClient.externalSkills.syncAllExternalSkills.useMutation,
  getSkillsQueryKey,
);
