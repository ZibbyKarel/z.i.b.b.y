import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

const NOTIFICATIONS_POLL_MS = 15_000;

export function getNotificationsQueryKey() {
  return ["notifications"] as const;
}

/** Polls `GET /api/notifications` — unread failed runs, the bell's content (same cadence as departments). */
export function useNotificationsQuery() {
  return apiClient.notifications.listNotifications.useQuery({
    queryKey: getNotificationsQueryKey(),
    refetchInterval: NOTIFICATIONS_POLL_MS,
    refetchIntervalInBackground: true,
    select: selectApiResponseBody,
  });
}
