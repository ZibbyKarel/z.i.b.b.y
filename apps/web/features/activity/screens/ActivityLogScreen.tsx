"use client";

import { ACTIVITY_GROUPS, DEFAULT_ACTIVITY_VIEW, DEPARTMENTS } from "@zibby/contracts";
import type { ActivityEntry, ActivityGroup } from "@zibby/contracts";
import { ACTIVITY_GROUP_OF } from "@zibby/contracts";
import {
  Button,
  Container,
  FilterBar,
  LogStream,
  type LogStreamLine,
  SelectField,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { clockTime } from "../../../utils/time";
import { useAgentsQuery } from "../../agents";
import { useActivityViewQuery } from "../../settings/queries";
import { buildActivityLog } from "../activityLog";
import { useActivityFeedInfiniteQuery } from "../queries";

const ALL = "";

/** Unique, order-preserving values of a `refs` field across the loaded feed —
 * the filter options are grounded in what's actually present, not an invented
 * catalog (a raw taskId doesn't have one). */
function uniqueRefValues(
  entries: readonly ActivityEntry[],
  pick: (e: ActivityEntry) => string | undefined,
) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    const v = pick(e);
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * `/activity/log` (ZB-07) — the live activity log over the activity SSE feed
 * (the same `useActivityFeedInfiniteQuery` + `buildActivityLog` wiring the HUD
 * rail and `ChatLiveLog` already use), promoted to a full screen with a
 * `FilterBar` (department, agent, task, kind-group) and pause/clear controls.
 * Kind visibility (grouped/hidden) still follows `/system/settings/activity`
 * (`useActivityViewQuery`).
 */
export function ActivityLogScreen() {
  const t = useTranslations();
  const locale = useLocale();

  const feed = useActivityFeedInfiniteQuery();
  const { data: view } = useActivityViewQuery();
  const { data: agents = [] } = useAgentsQuery();

  const [department, setDepartment] = useState(ALL);
  const [agent, setAgent] = useState(ALL);
  const [task, setTask] = useState(ALL);
  const [group, setGroup] = useState<ActivityGroup | typeof ALL>(ALL);
  const [paused, setPaused] = useState(false);
  const [clearedAt, setClearedAt] = useState(0);

  const liveEntries = useMemo(() => feed.data ?? [], [feed.data]);
  const [frozen, setFrozen] = useState<ActivityEntry[] | null>(null);
  const togglePause = () => {
    setFrozen(paused ? null : liveEntries);
    setPaused((p) => !p);
  };
  const entries = paused && frozen ? frozen : liveEntries;

  const taskOptions = useMemo(() => uniqueRefValues(entries, (e) => e.refs.taskId), [entries]);

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (department && e.refs.department !== department) return false;
        if (agent && e.refs.agentId !== agent) return false;
        if (task && e.refs.taskId !== task) return false;
        if (group && ACTIVITY_GROUP_OF[e.kind] !== group) return false;
        if (new Date(e.at).getTime() <= clearedAt) return false;
        return true;
      }),
    [entries, department, agent, task, group, clearedAt],
  );

  const rows = buildActivityLog(filtered, view ?? DEFAULT_ACTIVITY_VIEW);
  const lines: LogStreamLine[] = [...rows].reverse().map((row) => {
    if (row.type === "entry") {
      const source =
        (row.entry.refs.department &&
          (DEPARTMENTS.find((d) => d.id === row.entry.refs.department)?.name ??
            row.entry.refs.department)) ||
        row.entry.refs.agentId ||
        row.entry.refs.taskId ||
        "";
      return {
        id: row.key,
        ts: clockTime(row.entry.at, locale),
        source,
        text: row.entry.summary,
      };
    }
    return {
      id: row.key,
      ts: clockTime(row.at, locale),
      source: "",
      text: t("activityLog.grouped", {
        count: row.count,
        group: t(`settings.activity.groups.${row.group}`),
      }),
    };
  });

  const hasFilters = Boolean(department || agent || task || group);
  const clearFilters = () => {
    setDepartment(ALL);
    setAgent(ALL);
    setTask(ALL);
    setGroup(ALL);
  };

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150">
          <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
            {t("activityLog.eyebrow")}
          </Typography>
          <Typography type="h1">{t("activityLog.title")}</Typography>
        </Stack>

        <FilterBar
          actions={
            <Stack direction="row" gap="100">
              <Button intent={paused ? "primary" : "secondary"} onClick={togglePause} size="sm">
                {paused ? t("activityLog.resume") : t("activityLog.pause")}
              </Button>
              <Button intent="ghost" onClick={() => setClearedAt(Date.now())} size="sm">
                {t("activityLog.clear")}
              </Button>
            </Stack>
          }
          onClear={hasFilters ? clearFilters : undefined}
        >
          <SelectField
            label={t("activityLog.filter.department")}
            onValueChange={setDepartment}
            options={[
              { value: ALL, label: t("activityLog.filter.all") },
              ...DEPARTMENTS.map((d) => ({ value: d.id, label: d.name })),
            ]}
            value={department}
          />
          <SelectField
            label={t("activityLog.filter.agent")}
            onValueChange={setAgent}
            options={[
              { value: ALL, label: t("activityLog.filter.all") },
              ...agents.map((a) => ({ value: a.id, label: a.name ?? a.id })),
            ]}
            value={agent}
          />
          <SelectField
            label={t("activityLog.filter.task")}
            onValueChange={setTask}
            options={[
              { value: ALL, label: t("activityLog.filter.all") },
              ...taskOptions.map((id) => ({ value: id, label: id })),
            ]}
            value={task}
          />
          <SelectField
            label={t("activityLog.filter.kind")}
            onValueChange={(v) => setGroup(v as ActivityGroup | typeof ALL)}
            options={[
              { value: ALL, label: t("activityLog.filter.all") },
              ...ACTIVITY_GROUPS.map((g) => ({
                value: g,
                label: t(`settings.activity.groups.${g}`),
              })),
            ]}
            value={group}
          />
        </FilterBar>

        {feed.isPending ? (
          <QueryLoading />
        ) : feed.isError ? (
          <QueryError onRetry={() => void feed.refetch()} />
        ) : (
          <>
            <LogStream empty={t("activityLog.empty")} lines={lines} paused={paused} />
            {feed.hasNextPage && (
              <Button
                disabled={feed.isFetchingNextPage}
                intent="ghost"
                onClick={() => void feed.fetchNextPage()}
                size="sm"
              >
                {feed.isFetchingNextPage ? t("activityLog.loadingMore") : t("activityLog.loadMore")}
              </Button>
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}
