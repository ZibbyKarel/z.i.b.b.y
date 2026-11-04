import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  WebPushPublicKeySchema,
  WebPushSubscriptionSchema,
  WebPushUnsubscribeSchema,
} from "./web-push.schema";

const c = initContract();
const OkSchema = z.object({ ok: z.literal(true) });

/** Browser push (VAPID). The mutations sit behind the operator token. */
export const webPushContract = c.router(
  {
    getWebPushPublicKey: {
      method: "GET",
      path: "/web-push/public-key",
      responses: { 200: WebPushPublicKeySchema },
      summary: "The VAPID public key the browser subscribes with",
    },
    subscribeWebPush: {
      method: "POST",
      path: "/web-push/subscriptions",
      body: WebPushSubscriptionSchema,
      responses: { 200: OkSchema },
      summary: "Store this browser's push subscription",
    },
    unsubscribeWebPush: {
      method: "POST",
      path: "/web-push/unsubscribe",
      body: WebPushUnsubscribeSchema,
      responses: { 200: OkSchema },
      summary: "Drop a push subscription",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);

export type WebPushContract = typeof webPushContract;
