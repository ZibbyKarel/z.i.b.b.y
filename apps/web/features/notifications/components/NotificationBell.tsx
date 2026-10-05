"use client";

import { Button, CellStrip, EmptyState, Row, Sheet, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatWaited } from "../../approvals/approval";
import { useMarkNotificationsReadMutation } from "../mutations";
import { useNotificationsQuery } from "../queries";

export enum NotificationBellTestId {
  Trigger = "notification-bell-trigger",
  Item = "notification-bell-item",
  MarkRead = "notification-bell-mark-read",
  MarkAllRead = "notification-bell-mark-all-read",
}

/** The search param that opens the bell's sheet — so any link (e.g. an error Zibby) can open it. */
export const NOTIFICATIONS_PARAM = "notifications";

/**
 * The header bell: unread failed runs, each linking to its run detail with its
 * own "mark read", plus "mark all read". Reading a failure is what clears a
 * department's (and Zibby's) error state.
 */
export function NotificationBell() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: items = [] } = useNotificationsQuery();
  const markRead = useMarkNotificationsReadMutation();
  const open = searchParams.has(NOTIFICATIONS_PARAM);

  const setOpen = (next: boolean) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set(NOTIFICATIONS_PARAM, "open");
    else params.delete(NOTIFICATIONS_PARAM);
    const qs = params.toString();
    router.push((qs ? `${pathname}?${qs}` : pathname) as Route);
  };

  return (
    <>
      <Button
        aria-label={t("bellLabel", { count: items.length })}
        data-testid={NotificationBellTestId.Trigger}
        icon="bell"
        intent={items.length > 0 ? "danger" : "ghost"}
        onClick={() => setOpen(true)}
        size="sm"
      >
        {items.length > 0 ? String(items.length) : undefined}
      </Button>
      <Sheet
        footer={
          items.length > 0 && (
            <Button
              block
              data-testid={NotificationBellTestId.MarkAllRead}
              icon="check"
              intent="primary"
              loading={markRead.isPending}
              onClick={() => markRead.mutate({ body: {} })}
            >
              {t("markAllRead")}
            </Button>
          )
        }
        onClose={() => setOpen(false)}
        open={open}
        title={t("title")}
      >
        {items.length === 0 ? (
          <EmptyState body={t("empty")} title={t("emptyTitle")} />
        ) : (
          <Stack gap="100">
            {items.map((n) => (
              <Row
                align="center"
                data-testid={NotificationBellTestId.Item}
                gap="100"
                justify="between"
                key={n.runId}
              >
                <Link href={`/activity/runs/${n.runId}` as Route}>
                  <Row align="center" gap="100">
                    <CellStrip cells={["error"]} />
                    <Stack gap="0">
                      <Typography type="labelSm">{n.title}</Typography>
                      <Typography type="note" variant="tertiary">
                        {[n.department?.toUpperCase(), formatWaited(n.failedAt)]
                          .filter(Boolean)
                          .join(" · ")}
                      </Typography>
                    </Stack>
                  </Row>
                </Link>
                <Button
                  aria-label={t("markRead")}
                  data-testid={NotificationBellTestId.MarkRead}
                  disabled={markRead.isPending}
                  icon="check"
                  intent="ghost"
                  onClick={() => markRead.mutate({ body: { runIds: [n.runId] } })}
                  size="sm"
                />
              </Row>
            ))}
          </Stack>
        )}
      </Sheet>
    </>
  );
}
