import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the global level-mapping table; exported so the mutation invalidates it. */
export function getLevelMappingQueryKey() {
  return ["roadmap", "level-mapping"] as const;
}

/**
 * The global external-level -> epic/task/ignore mapping table (`GET
 * /api/roadmap/level-mapping`) shown at `/settings?tab=tasks`. `select` unwraps the
 * `{ status, body }` envelope so `data` is the `LevelMapping` (`{ entries }`) directly.
 */
export function useLevelMappingQuery() {
  return apiClient.roadmap.getLevelMapping.useQuery({
    queryKey: getLevelMappingQueryKey(),
    select: selectApiResponseBody,
  });
}
