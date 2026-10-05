import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { FailedRunNotificationSchema, MarkNotificationsReadSchema } from "./notification.schema";

const c = initContract();

/** The operator's notification bell — unread failed runs, newest first. */
export const notificationsContract = c.router(
  {
    listNotifications: {
      method: "GET",
      path: "/notifications",
      responses: { 200: z.array(FailedRunNotificationSchema) },
      summary: "Unread failed runs, newest first",
    },
    markNotificationsRead: {
      method: "POST",
      path: "/notifications/read",
      body: MarkNotificationsReadSchema,
      responses: { 200: z.array(FailedRunNotificationSchema) },
      summary:
        "Mark the given failed runs read (all unread ones when `runIds` is omitted); returns what stays unread",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);

export type NotificationsContract = typeof notificationsContract;
