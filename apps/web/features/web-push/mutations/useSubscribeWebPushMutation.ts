import { apiClient } from "../../../state/api";

/** Store this browser's push subscription (`POST /web-push/subscriptions`). */
export const useSubscribeWebPushMutation = () => apiClient.webPush.subscribeWebPush.useMutation();
