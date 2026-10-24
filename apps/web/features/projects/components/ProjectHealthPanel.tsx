"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import type { Project } from "@zibby/contracts";
import { Button, Panel, Stack, StatusDot, TextLink, Typography } from "@zibby/design-system";
import {
  useAnalyzeProjectHealthMutation,
  useCheckProjectHealthMutation,
} from "../../project-health/mutations";
import { useProjectHealthQuery } from "../../project-health/queries";

export enum ProjectHealthPanelTestId {
  Root = "project-health-panel",
  State = "project-health-state",
  Check = "project-health-check",
  Analyze = "project-health-analyze",
  AnalysisLink = "project-health-analysis-link",
  Empty = "project-health-empty",
}

export interface ProjectHealthPanelProps {
  projectId: string;
  /** The project's configured health check; absent renders the explanatory empty state. */
  healthCheck?: Project["healthCheck"];
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Monitoring panel on the project detail: the last known health of the project's
 * health URL — STATE, not an event (the watcher overwrites it each check). Down
 * offers "Analyze", which creates one ordinary investigation task (never
 * autonomous — the operator clicks); success links to that task.
 */
export function ProjectHealthPanel({ projectId, healthCheck }: ProjectHealthPanelProps) {
  const t = useTranslations("projects.health");
  const { data } = useProjectHealthQuery();
  const check = useCheckProjectHealthMutation();
  const analyze = useAnalyzeProjectHealthMutation();
  const [startedTaskId, setStartedTaskId] = useState<string | null>(null);

  if (!healthCheck) {
    return (
      <Panel data-testid={ProjectHealthPanelTestId.Root} header={t("title")} padding="200">
        <Typography
          data-testid={ProjectHealthPanelTestId.Empty}
          size="sm"
          type="note"
          variant="tertiary"
        >
          {t("empty")}
        </Typography>
      </Panel>
    );
  }

  const status = (data ?? []).find((s) => s.projectId === projectId);
  const down = status?.state === "down";
  const taskId = startedTaskId ?? (down ? status?.analysisTaskId : undefined);

  return (
    <Panel
      data-testid={ProjectHealthPanelTestId.Root}
      header={t("title")}
      headerEnd={
        <Button
          data-testid={ProjectHealthPanelTestId.Check}
          disabled={check.isPending}
          icon="retry"
          intent="ghost"
          onClick={() => check.mutate({ params: { projectId }, body: {} })}
          size="sm"
        >
          {t("checkNow")}
        </Button>
      }
      padding="200"
    >
      <Stack gap="150">
        <Typography mono size="sm" type="note" variant="secondary">
          {healthCheck.url}
        </Typography>
        {status ? (
          <>
            <Stack
              align="center"
              data-testid={ProjectHealthPanelTestId.State}
              direction="row"
              gap="100"
            >
              <StatusDot tone={down ? "error" : "done"} />
              <Typography size="sm" type="text">
                {down ? t("down") : t("up")}
              </Typography>
            </Stack>
            <Typography size="xs" type="note" variant="tertiary">
              {[
                t("since", { when: formatWhen(status.sinceAt) }),
                t("checkedAt", { when: formatWhen(status.checkedAt) }),
                status.httpStatus != null ? `HTTP ${status.httpStatus}` : null,
                status.latencyMs != null ? `${status.latencyMs} ms` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
            {down && status.error && (
              <Typography size="sm" type="note" variant="secondary">
                {status.error}
              </Typography>
            )}
          </>
        ) : (
          <Typography size="sm" type="note" variant="tertiary">
            {t("notChecked")}
          </Typography>
        )}

        {down && (
          <Stack align="center" direction="row" gap="150">
            <Button
              data-testid={ProjectHealthPanelTestId.Analyze}
              disabled={analyze.isPending}
              icon="search"
              intent="primary"
              onClick={() =>
                analyze.mutate(
                  { params: { projectId }, body: {} },
                  { onSuccess: (res) => setStartedTaskId(res.body.taskId) },
                )
              }
              size="sm"
            >
              {t("analyze")}
            </Button>
            {taskId && (
              <TextLink
                data-testid={ProjectHealthPanelTestId.AnalysisLink}
                href={`/work/tasks/${taskId}` as Route}
                linkComponent={Link}
              >
                {t("analysisStarted")}
              </TextLink>
            )}
          </Stack>
        )}
        {(analyze.isError || check.isError) && (
          <Typography role="alert" size="xs" type="note" variant="secondary">
            {t("actionFailed")}
          </Typography>
        )}
      </Stack>
    </Panel>
  );
}
