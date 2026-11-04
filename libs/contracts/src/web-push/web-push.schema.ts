import { z } from "zod";

/** A browser's PushSubscription (`subscription.toJSON()`), posted by the web app. */
export const WebPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export type WebPushSubscription = z.infer<typeof WebPushSubscriptionSchema>;

export const WebPushPublicKeySchema = z.object({ publicKey: z.string() });
export type WebPushPublicKey = z.infer<typeof WebPushPublicKeySchema>;

export const WebPushUnsubscribeSchema = z.object({ endpoint: z.string().url() });
export type WebPushUnsubscribe = z.infer<typeof WebPushUnsubscribeSchema>;
