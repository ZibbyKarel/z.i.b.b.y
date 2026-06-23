"use client";
import { useTranslations } from "next-intl";
import { Typography } from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { ActivityFeed } from "../../overview/components/ActivityFeed/ActivityFeed";
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
    <HudPanel title={t("integrationActivity.title")}>
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
    </HudPanel>
  );
}
