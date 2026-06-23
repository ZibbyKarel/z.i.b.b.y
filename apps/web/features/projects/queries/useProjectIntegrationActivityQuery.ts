import type { ActivityKind } from "@zibby/contracts";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * The activity kinds that represent "something an integration processed" — every
 * inbound channel item and its triage outcome (relevant → task, irrelevant →
 * ignored, notify-only, read-only noted), plus a poll that failed after retries.
 */
export const INTEGRATION_ACTIVITY_KINDS: ActivityKind[] = [
  "channel-item",
  "channel-triage",
  "channel-reply",
  "channel-approval",
  "channel-ignored",
  "channel-noted",
  "channel-needs-attention",
  "integration-retry-exhausted",
];

/** Window (days) the per-project integration log looks back over. */
const ACTIVITY_WINDOW_DAYS = 14;

export function getProjectIntegrationActivityQueryKey(projectId: string) {
  return ["projects", projectId, "integration-activity"] as const;
}

/**
 * The per-project integration-processing log (`GET /api/activity?projectId=…`): what
 * each of the project's integrations processed and the outcome, newest-first across a
 * 14-day window. Pass `{ enabled: false }` to keep it inert until a project id exists.
 */
export function useProjectIntegrationActivityQuery(
  projectId: string,
  options?: { enabled?: boolean },
) {
  return apiClient.activity.listActivity.useQuery({
    queryKey: getProjectIntegrationActivityQueryKey(projectId),
    queryData: {
      query: {
        projectId,
        kinds: INTEGRATION_ACTIVITY_KINDS.join(","),
        days: ACTIVITY_WINDOW_DAYS,
        limit: 50,
      },
    },
    select: selectApiResponseBody,
    enabled: options?.enabled,
  });
}
