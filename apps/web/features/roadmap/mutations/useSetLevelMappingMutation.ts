import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getLevelMappingQueryKey } from "../queries/useLevelMappingQuery";

/**
 * Replace the global level-mapping table (`PUT /api/roadmap/level-mapping`). The body
 * is the WHOLE `{ entries }` document — entries for every `kind` live in it, so a
 * caller editing one kind's rows must merge in the other kind's untouched entries
 * before calling `.mutate`, or it silently drops them.
 */
export const useSetLevelMappingMutation = makeInvalidatingMutation(
  apiClient.roadmap.putLevelMapping.useMutation,
  getLevelMappingQueryKey,
);
