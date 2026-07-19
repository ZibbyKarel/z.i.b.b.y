"use client";

import { useState } from "react";
import { Button, ButtonGroup, Container, Stack, StatusDot, Typography } from "@zibby/design-system";
import { DEFAULT_ACTIVITY_VIEW, SUBSYSTEMS, type SubsystemId } from "@zibby/contracts";
import { useLocale, useTranslations } from "next-intl";
import { buildActivityLog } from "../../../features/activity/activityLog";
import { useActivityFeedInfiniteQuery } from "../../../features/activity/queries";
import { useActivityViewQuery } from "../../../features/settings/queries";
import { clockTime } from "../../../utils/time";

export enum RightRailTestId {
  Root = "right-rail",
  Log = "right-rail-log",
  Line = "right-rail-line",
  LoadOlder = "right-rail-load-older",
  /** The deselectable per-subsystem filter over `refs.ownerSubsystem` (NS2 F3c);
   *  only rendered when at least one loaded entry carries the tag. */
  SubsystemFilter = "right-rail-subsystem-filter",
}

/** One `> HH:MM  summary` log line. */
function LogLine({ time, text, muted }: { time: string; text: string; muted?: boolean }) {
  return (
    <Stack align="start" data-testid={RightRailTestId.Line} direction="row" gap="100">
      <Typography mono size="xs" tone="accent" type="note">
        &gt;
      </Typography>
      <Typography mono size="xs" type="note" variant="tertiary">
        {time}
      </Typography>
      <Container grow minW0>
        <Typography size="sm" type="note" variant={muted ? "tertiary" : "secondary"}>
          {text}
        </Typography>
      </Container>
    </Stack>
  );
}

/**
 * The right rail — a single live log of what the server is doing right now
 * ("> 10:03  Integration gmail checked for changes"). Streamed over SSE (entries are
 * prepended as they land) and paginated backwards through the whole on-disk history
 * via an infinite query. Which activity groups show as individual lines, collapse
 * into a counted row, or hide entirely is the operator's Settings → Activity config.
 * Approvals and other needs-you items live on the Overview page, not here.
 *
 * NS2 F3c: a deselectable subsystem filter narrows the log CLIENT-SIDE over each
 * entry's `refs.ownerSubsystem` (F2c). Only subsystems with ≥1 tagged entry in
 * the loaded feed get a button; deselecting shows everything again. Untagged
 * entries (system-owned records) only appear in the unfiltered view — the filter
 * is an attribution lens, not a completeness guarantee.
 */
export function RightRail() {
  const t = useTranslations();
  const locale = useLocale();
  const feed = useActivityFeedInfiniteQuery();
  const { data: view } = useActivityViewQuery();
  const [subsystemFilter, setSubsystemFilter] = useState<SubsystemId | null>(null);

  const entries = feed.data ?? [];
  const taggedSubsystems = new Set(
    entries.map((e) => e.refs.ownerSubsystem).filter((id): id is SubsystemId => id !== undefined),
  );
  const filterOptions = SUBSYSTEMS.filter((s) => taggedSubsystems.has(s.id));
  const filtered = subsystemFilter
    ? entries.filter((e) => e.refs.ownerSubsystem === subsystemFilter)
    : entries;
  const rows = buildActivityLog(filtered, view ?? DEFAULT_ACTIVITY_VIEW);

  return (
    <Stack data-testid={RightRailTestId.Root} gap="200">
      <Stack align="center" direction="row" gap="100">
        <StatusDot pulse tone="run" />
        <Typography mono size="xs" tone="accent" type="note">
          {t("overview.liveLog")}
        </Typography>
      </Stack>

      {filterOptions.length > 0 && (
        <Container data-testid={RightRailTestId.SubsystemFilter}>
          <ButtonGroup
            deselectable
            ariaLabel={t("overview.liveLogSubsystemFilter")}
            onChange={(v) => setSubsystemFilter(v ? (v as SubsystemId) : null)}
            options={filterOptions.map((s) => ({ id: s.id, label: s.name }))}
            value={subsystemFilter ?? ""}
          />
        </Container>
      )}

      {rows.length === 0 ? (
        <Typography mono size="sm" type="note" variant="tertiary">
          {t("overview.liveLogEmpty")}
        </Typography>
      ) : (
        <Stack data-testid={RightRailTestId.Log} gap="50">
          {rows.map((row) =>
            row.type === "entry" ? (
              <LogLine
                key={row.key}
                text={row.entry.summary}
                time={clockTime(row.entry.at, locale)}
              />
            ) : (
              <LogLine
                muted
                key={row.key}
                text={t("overview.groupedCount", {
                  count: row.count,
                  group: t(`settings.activity.groups.${row.group}`),
                })}
                time={clockTime(row.at, locale)}
              />
            ),
          )}
        </Stack>
      )}

      {feed.hasNextPage && (
        <Button
          block
          data-testid={RightRailTestId.LoadOlder}
          intent="ghost"
          loading={feed.isFetchingNextPage}
          onClick={() => void feed.fetchNextPage()}
          size="sm"
        >
          {t("overview.loadOlder")}
        </Button>
      )}
    </Stack>
  );
}
