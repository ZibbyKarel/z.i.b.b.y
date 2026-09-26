"use client";
import { useTranslations } from "next-intl";
import { Panel, Typography } from "@zibby/design-system";
import { ActivityFeed } from "../../activity/components/ActivityFeed/ActivityFeed";
import { useProjectIntegrationActivityQuery } from "../queries";

export enum ProjectIntegrationActivityPanelTestId {
  Empty = "project-integration-activity-empty",
}

export interface ProjectIntegrationActivityPanelProps {
  projectId: string;
}

/**
 * The per-project integration-processing log: a time-stamped feed of what the
 * project's integrations processed (inbound item → triage outcome: a task created,
 * ignored as irrelevant, surfaced for attention, or noted) over a 14-day window.
 * Reuses the overview {@link ActivityFeed}, scoped server-side by `projectId`.
 */
export function ProjectIntegrationActivityPanel({
  projectId,
}: ProjectIntegrationActivityPanelProps) {
  const t = useTranslations("projects.profile");
  const { data = [] } = useProjectIntegrationActivityQuery(projectId, {
    enabled: Boolean(projectId),
  });

  return (
    <Panel header={t("integrationActivity.title")} padding="200">
      {data.length === 0 ? (
        <Typography
          mono
          data-testid={ProjectIntegrationActivityPanelTestId.Empty}
          size="sm"
          type="note"
          variant="tertiary"
        >
          {t("integrationActivity.empty")}
        </Typography>
      ) : (
        <ActivityFeed items={data} limit={12} />
      )}
    </Panel>
  );
}
