import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getSkillsQueryKey } from "../queries/useSkillsQuery";

/** Delete a skill (`DELETE /api/skills/:id`); refreshes the skill list on success. */
export const useDeleteSkillMutation = makeInvalidatingMutation(
  apiClient.skills.deleteSkill.useMutation,
  getSkillsQueryKey,
);
