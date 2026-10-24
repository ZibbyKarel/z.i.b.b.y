"use client";

import { useState } from "react";
import {
  Button,
  CellStrip,
  EmptyState,
  Row,
  Sheet,
  Stack,
  TextLink,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatWaited } from "../../approvals/approval";
import { formatWhen } from "../../project-health/formatWhen";
import { apiErrorMessage } from "../../../state/apiErrorMessage";
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
  HealthLink = "notification-bell-health-link",
  HealthTaskLink = "notification-bell-health-task-link",
}

/** The search param that opens the bell's sheet — so any link (e.g. an error Zibby) can open it. */
export const NOTIFICATIONS_PARAM = "notifications";

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
  // Per-row Analyze feedback, keyed by project: the started task or the last failure.
  const [feedback, setFeedback] = useState<Record<string, { taskId?: string; error?: string }>>({});
  const analyzeProject = (projectId: string) => {
    setFeedback((f) => ({ ...f, [projectId]: {} }));
    analyze.mutate(
      { params: { projectId }, body: {} },
      {
        onSuccess: (res) =>
          setFeedback((f) => ({ ...f, [projectId]: { taskId: res.body.taskId } })),
        onError: (error) =>
          setFeedback((f) => ({
            ...f,
            [projectId]: { error: apiErrorMessage(error) ?? t("healthActionFailed") },
          })),
      },
    );
  };
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
              const fb = feedback[s.projectId];
              const taskId = s.analysisTaskId ?? fb?.taskId;
              const rowAnalyzing =
                analyze.isPending && analyze.variables?.params.projectId === s.projectId;
              return (
                <Stack data-testid={NotificationBellTestId.HealthItem} gap="25" key={s.projectId}>
                  <Row align="center" gap="100" justify="between">
                    <Link
                      data-testid={NotificationBellTestId.HealthLink}
                      href={`/projects/${s.projectId}` as Route}
                    >
                      <Row align="center" gap="100">
                        <CellStrip cells={["error"]} />
                        <Typography type="labelSm">
                          {t("healthDown", { name, since: formatWhen(s.sinceAt) })}
                        </Typography>
                      </Row>
                    </Link>
                    <Button
                      data-testid={NotificationBellTestId.HealthAnalyze}
                      disabled={rowAnalyzing}
                      icon="search"
                      intent="ghost"
                      onClick={() => analyzeProject(s.projectId)}
                      size="sm"
                    >
                      {taskId ? t("healthAnalyzeAgain") : t("healthAnalyze")}
                    </Button>
                  </Row>
                  {taskId && (
                    <TextLink
                      data-testid={NotificationBellTestId.HealthTaskLink}
                      href={`/work/tasks/${taskId}` as Route}
                      linkComponent={Link}
                    >
                      {t("healthAnalysisStarted")}
                    </TextLink>
                  )}
                  {fb?.error && (
                    <Typography role="alert" size="xs" type="note" variant="secondary">
                      {fb.error}
                    </Typography>
                  )}
                </Stack>
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
