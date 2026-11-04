import { apiClient } from "../../../state/api";

/** Drop this browser's push subscription (`POST /web-push/unsubscribe`). */
export const useUnsubscribeWebPushMutation = () =>
  apiClient.webPush.unsubscribeWebPush.useMutation();
