import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getSkillsQueryKey } from "../queries/useSkillsQuery";

/** Create a skill (`POST /api/skills`); refreshes the skill list on success. */
export const useCreateSkillMutation = makeInvalidatingMutation(
  apiClient.skills.createSkill.useMutation,
  getSkillsQueryKey,
);
