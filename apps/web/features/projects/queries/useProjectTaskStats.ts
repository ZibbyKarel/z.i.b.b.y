"use client";

import { useMemo } from "react";
import { useRunsQuery } from "../../runs";
import { RUN_STATUS_GROUPS, type RunStatusGroup } from "../../runs/statusGroups";

/** One status-bucket count for a project's task feed. */
export interface ProjectTaskStat {
  group: RunStatusGroup;
  count: number;
}

/** A project's task-run counts: the leading total plus one entry per status bucket. */
export interface ProjectTaskStats {
  /** Every task-spawned run attributed to this project. */
  total: number;
  /** One entry per {@link RUN_STATUS_GROUPS} bucket, in lifecycle order. */
  groups: ProjectTaskStat[];
}

/**
 * The single source of a project's per-status task counts — shared by the project
 * detail's run summary ({@link ProjectRunSummary}) and the project-card footer so
 * the two can never diverge. Counts come from the same unified `useRunsQuery` feed
 * the runs screen reads, filtered client-side by `projectId` (the field the API
 * joins onto every task-spawned run), then bucketed by {@link RUN_STATUS_GROUPS}.
 */
export function useProjectTaskStats(projectId: string): ProjectTaskStats {
  const { runs } = useRunsQuery();
  return useMemo(() => {
    const mine = runs.filter((r) => r.projectId === projectId);
    return {
      total: mine.length,
      groups: RUN_STATUS_GROUPS.map((group) => ({
        group,
        count: mine.filter((r) => group.statuses.includes(r.status)).length,
      })),
    };
  }, [runs, projectId]);
}
