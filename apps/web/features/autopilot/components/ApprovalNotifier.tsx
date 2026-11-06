"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { onRunEvent } from "../../runs/runEvents";
import { useAutopilotQuery } from "../queries";

/**
 * In "Approve" mode (autopilot `off`) every new approval pops a system notification, so the
 * operator notices something waits on them. Under AUTOPILOT it stays quiet: the covered
 * approvals resolve themselves and the rest is reported elsewhere. Renders nothing.
 */
export function ApprovalNotifier() {
  const t = useTranslations("autopilot");
  const { data } = useAutopilotQuery();
  const approveMode = data?.level === "off";
  const title = t("approvalNotificationTitle");

  useEffect(() => {
    if (!approveMode || typeof Notification === "undefined") return;
    if (Notification.permission === "default") void Notification.requestPermission();
    return onRunEvent((event) => {
      if (event.scope !== "activity" || event.kind !== "approval-requested") return;
      if (Notification.permission !== "granted") return;
      const n = new Notification(title, {
        body: event.entry?.summary,
        tag: event.entry?.refs?.approvalId,
      });
      n.onclick = () => window.focus();
    });
  }, [approveMode, title]);

  return null;
}
