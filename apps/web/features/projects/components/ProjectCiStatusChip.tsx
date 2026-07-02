"use client";

import type { CiStatus } from "@zibby/contracts";
import { Tag } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useCiStatusQuery } from "../queries";

export enum ProjectCiStatusChipTestId {
  Chip = "project-ci-status-chip",
}

export interface ProjectCiStatusChipProps {
  projectId: string;
}

/** "HH:MM" in the operator's locale — the "since" half of the red line. */
function sinceLabel(status: CiStatus): string {
  return new Date(status.sinceAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * CI health chip on the project detail (N4b) — STATE, not an event: it reflects
 * the last known red/green and disappears entirely for a project with no watched
 * CI. Three indicators carry the state (Tag tone colour + x/check glyph + text
 * "CI červené od HH:MM"), so it never rides colour alone (a11y). One chip per
 * watched (integration × adapter); `title` carries the deciding-run context.
 */
export function ProjectCiStatusChip({ projectId }: ProjectCiStatusChipProps) {
  const t = useTranslations("projects.ci");
  const { data } = useCiStatusQuery(projectId);
  const statuses = data ?? [];
  if (statuses.length === 0) return null;
  return (
    <>
      {statuses.map((status) => {
        const red = status.state === "red";
        return (
          <Tag
            data-testid={ProjectCiStatusChipTestId.Chip}
            icon={red ? "x" : "check"}
            key={`${status.integrationId}--${status.adapterKind}`}
            title={status.summary}
            tone={red ? "bad" : "ok"}
          >
            {red ? t("red", { since: sinceLabel(status) }) : t("green")}
          </Tag>
        );
      })}
    </>
  );
}
