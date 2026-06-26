"use client";

import { Button, Container, Stack, StatusDot, Typography } from "@zibby/design-system";
import { DEFAULT_ACTIVITY_VIEW } from "@zibby/contracts";
import { useTranslations } from "next-intl";
import { buildActivityLog } from "../../../features/overview/activityLog";
import { useActivityFeedInfiniteQuery } from "../../../features/overview/queries";
import { useActivityViewQuery } from "../../../features/settings/queries";

export enum RightRailTestId {
  Root = "right-rail",
  Log = "right-rail-log",
  Line = "right-rail-line",
  LoadOlder = "right-rail-load-older",
}

/** "HH:MM" in UTC straight off the ISO timestamp — deterministic, locale-free. */
function clockTime(at: string): string {
  return at.length >= 16 ? at.slice(11, 16) : "";
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
 */
export function RightRail() {
  const t = useTranslations();
  const feed = useActivityFeedInfiniteQuery();
  const { data: view } = useActivityViewQuery();
  const rows = buildActivityLog(feed.data ?? [], view ?? DEFAULT_ACTIVITY_VIEW);

  return (
    <Stack data-testid={RightRailTestId.Root} gap="200">
      <Stack align="center" direction="row" gap="100">
        <StatusDot pulse tone="run" />
        <Typography mono size="xs" tone="accent" type="note">
          {t("overview.liveLog")}
        </Typography>
      </Stack>

      {rows.length === 0 ? (
        <Typography mono size="sm" type="note" variant="tertiary">
          {t("overview.liveLogEmpty")}
        </Typography>
      ) : (
        <Stack data-testid={RightRailTestId.Log} gap="50">
          {rows.map((row) =>
            row.type === "entry" ? (
              <LogLine key={row.key} text={row.entry.summary} time={clockTime(row.entry.at)} />
            ) : (
              <LogLine
                muted
                key={row.key}
                text={t("overview.groupedCount", {
                  count: row.count,
                  group: t(`settings.activity.groups.${row.group}`),
                })}
                time={clockTime(row.at)}
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
