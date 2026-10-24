"use client";

import { Button, CellStrip, EmptyState, Row, Sheet, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatWaited } from "../../approvals/approval";
import { useAnalyzeProjectHealthMutation } from "../../project-health/mutations";
import { useProjectHealthQuery } from "../../project-health/queries";
import { useProjectsQuery } from "../../projects/queries";
import { useMarkNotificationsReadMutation } from "../mutations";
import { useNotificationsQuery } from "../queries";

export enum NotificationBellTestId {
  Trigger = "notification-bell-trigger",
  Item = "notification-bell-item",
  MarkRead = "notification-bell-mark-read",
  MarkAllRead = "notification-bell-mark-all-read",
  HealthItem = "notification-bell-health-item",
  HealthAnalyze = "notification-bell-health-analyze",
}

/** The search param that opens the bell's sheet — so any link (e.g. an error Zibby) can open it. */
export const NOTIFICATIONS_PARAM = "notifications";

function formatSince(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The header bell: unread failed runs, each linking to its run detail with its
 * own "mark read", plus down projects (state, not events: no mark-read, they
 * clear on recovery) with an inline Analyze, plus "mark all read". Reading a failure is what clears a
 * department's (and Zibby's) error state.
 */
export function NotificationBell() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: items = [] } = useNotificationsQuery();
  const { data: healthStatuses = [] } = useProjectHealthQuery();
  const { data: projects = [] } = useProjectsQuery();
  const analyze = useAnalyzeProjectHealthMutation();
  const downProjects = healthStatuses.filter((s) => s.state === "down");
  const total = items.length + downProjects.length;
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
        aria-label={t("bellLabel", { count: total })}
        data-testid={NotificationBellTestId.Trigger}
        icon="bell"
        intent={total > 0 ? "danger" : "ghost"}
        onClick={() => setOpen(true)}
        size="sm"
      >
        {total > 0 ? String(total) : undefined}
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
        {total === 0 ? (
          <EmptyState body={t("empty")} title={t("emptyTitle")} />
        ) : (
          <Stack gap="100">
            {downProjects.map((s) => {
              const name = projects.find((p) => p.id === s.projectId)?.name ?? s.projectId;
              return (
                <Row
                  align="center"
                  data-testid={NotificationBellTestId.HealthItem}
                  gap="100"
                  justify="between"
                  key={s.projectId}
                >
                  <Link href={`/projects/${s.projectId}` as Route}>
                    <Row align="center" gap="100">
                      <CellStrip cells={["error"]} />
                      <Typography type="labelSm">
                        {t("healthDown", { name, since: formatSince(s.sinceAt) })}
                      </Typography>
                    </Row>
                  </Link>
                  <Button
                    data-testid={NotificationBellTestId.HealthAnalyze}
                    disabled={analyze.isPending}
                    icon="search"
                    intent="ghost"
                    onClick={() => analyze.mutate({ params: { projectId: s.projectId }, body: {} })}
                    size="sm"
                  >
                    {t("healthAnalyze")}
                  </Button>
                </Row>
              );
            })}
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
                        {[n.department, formatWaited(n.failedAt)].filter(Boolean).join(" · ")}
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
