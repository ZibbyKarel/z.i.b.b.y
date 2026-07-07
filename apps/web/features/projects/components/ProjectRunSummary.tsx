"use client";

import { Stack, Stat } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { groupFilterParam } from "../../runs/statusGroups";
import { useActiveProject } from "../context/ProjectProvider";
import { useProjectTaskStats } from "../queries";

export interface ProjectRunSummaryProps {
  projectId: string;
}

/**
 * Per-project run summary on the project overview tab: a leading total plus one
 * tile per {@link RUN_STATUS_GROUPS} bucket, each a deep-link into the runs feed
 * pre-filtered to this project (and, for a bucket, its member states). Counts come
 * from the same unified `useRunsQuery` feed the runs screen reads, filtered client-
 * side by `projectId` — the field the API now joins onto every task-spawned run.
 *
 * Phase 24: the runs feed no longer reads a `?project=` query — the top-bar
 * selector is the single scope now — so each tile arms that scope (via
 * `setActiveProject`) before the `Link`'s own navigation fires, dropping the
 * now-dead `project=` param from the href.
 *
 * Typed routes can't infer a query-string-carrying template stored in a variable,
 * so each `href` is cast `as Route` (the codebase-wide convention for `<Link>`).
 */
export function ProjectRunSummary({ projectId }: ProjectRunSummaryProps) {
  const t = useTranslations("runs");
  const tp = useTranslations("projects");
  const { setActiveProject } = useActiveProject();
  const { total, groups } = useProjectTaskStats(projectId);

  return (
    <HudPanel padding="300" title={tp("runsPanelTitle")}>
      <Stack wrap direction="row" gap="450">
        <Link
          data-testid="project-run-summary-total"
          href={"/runs" as Route}
          onClick={() => setActiveProject(projectId)}
        >
          <Stat icon="pulse" label={t("group.total")} tone="neutral" value={total} />
        </Link>
        {groups.map(({ group: g, count }) => {
          const href = `/runs?filter=${groupFilterParam(g)}` as Route;
          return (
            <Link
              data-testid={`project-run-summary-${g.key}`}
              href={href}
              key={g.key}
              onClick={() => setActiveProject(projectId)}
            >
              <Stat
                icon={g.icon}
                label={t(`group.${g.key}`)}
                tone={count > 0 ? g.tone : "neutral"}
                value={count}
              />
            </Link>
          );
        })}
      </Stack>
    </HudPanel>
  );
}
