"use client";

import { useEffect, useRef, useState } from "react";
import {
  Container,
  GlassSurface,
  Icon,
  Pressable,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { DEFAULT_ACTIVITY_VIEW } from "@zibby/contracts";
import { useLocale, useTranslations } from "next-intl";
import { buildActivityLog } from "../../overview/activityLog";
import { useActivityFeedInfiniteQuery } from "../../overview/queries";
import { useActivityViewQuery } from "../../settings/queries";
import { clockTime } from "../../../utils/time";

export enum ChatLiveLogTestId {
  Root = "chat-live-log",
  Toggle = "chat-live-log-toggle",
  Panel = "chat-live-log-panel",
  Close = "chat-live-log-close",
  Line = "chat-live-log-line",
}

export interface ChatLiveLogProps {
  /** Mirrors the other floating chat widgets: dims, blurs and disables pointer
   *  events while an overlay (dialog/drawer) is up. */
  dimmed?: boolean;
}

/** One `HH:MM  summary` mono log line. */
function LogLine({ time, text, muted }: { time: string; text: string; muted?: boolean }) {
  return (
    <Stack align="start" data-testid={ChatLiveLogTestId.Line} direction="row" gap="100">
      <Typography mono size="xs" tone="accent" type="note">
        {time}
      </Typography>
      <Container grow minW0>
        <Typography mono size="xs" type="note" variant={muted ? "tertiary" : "secondary"}>
          {text}
        </Typography>
      </Container>
    </Stack>
  );
}

/**
 * Bottom-right live-log mini widget for the Chat UI (Velín-D `VcLiveLog`). Reuses
 * the HUD RightRail's exact data wiring — `useActivityFeedInfiniteQuery` +
 * `useActivityViewQuery` + `buildActivityLog` — so it renders the same rows, just
 * inside a collapsible glass widget instead of the rail's static column. Live
 * updates arrive automatically: the global `RunEventsProvider` prepends SSE
 * activity entries into the shared `["activity","feed"]` cache.
 *
 * Self-contained (owns its own open/close state) and position-agnostic — no
 * absolute screen coordinates; the mounting page places it bottom-right.
 */
export function ChatLiveLog({ dimmed = false }: ChatLiveLogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLElement>(null);

  const feed = useActivityFeedInfiniteQuery();
  const { data: view } = useActivityViewQuery();
  const rows = buildActivityLog(feed.data ?? [], view ?? DEFAULT_ACTIVITY_VIEW);
  // buildActivityLog returns newest-first; the design wants newest at the bottom.
  const displayRows = [...rows].reverse();

  // Auto-scroll to the newest line whenever the panel is open and new rows land.
  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [displayRows.length, open]);

  return (
    <Container
      data-testid={ChatLiveLogTestId.Root}
      pointerEvents={dimmed ? "none" : "auto"}
      style={{
        opacity: dimmed ? 0.3 : 1,
        filter: dimmed ? "blur(2.5px)" : "none",
        transition: "opacity .4s ease, filter .4s ease",
      }}
    >
      {open ? (
        <GlassSurface
          data-testid={ChatLiveLogTestId.Panel}
          radius="panel"
          style={{
            width: 300,
            maxHeight: "40vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Container
            padding="150"
            style={{ borderBottom: "1px solid var(--color-glass-border)" }}
          >
            <Stack align="center" direction="row" gap="100">
              <StatusDot pulse tone="run" />
              <Typography mono size="xs" tone="accent" type="note">
                {t("overview.liveLog")}
              </Typography>
              <Container grow />
              <Pressable
                aria-label={t("chat.close")}
                data-testid={ChatLiveLogTestId.Close}
                onClick={() => setOpen(false)}
                title={t("chat.close")}
              >
                <Icon name="x" size="xs" />
              </Pressable>
            </Stack>
          </Container>

          <Container
            grow
            overflowY="auto"
            padding="150"
            ref={bodyRef}
            style={{
              maskImage: "linear-gradient(to bottom, transparent 0%, black 14px)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 14px)",
            }}
          >
            {displayRows.length === 0 ? (
              <Typography mono size="sm" type="note" variant="tertiary">
                {t("overview.liveLogEmpty")}
              </Typography>
            ) : (
              <Stack gap="75">
                {displayRows.map((row) =>
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
          </Container>
        </GlassSurface>
      ) : (
        <GlassSurface radius="pill" style={{ width: 44, height: 44, position: "relative" }}>
          <Pressable
            aria-label={t("overview.liveLog")}
            data-testid={ChatLiveLogTestId.Toggle}
            onClick={() => setOpen(true)}
            style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}
            title={t("overview.liveLog")}
          >
            <Icon name="code" size="md" tone="dim" />
          </Pressable>
          <Container pointerEvents="none" position="absolute" right="6px" top="6px">
            <StatusDot pulse size="75" tone="run" />
          </Container>
        </GlassSurface>
      )}
    </Container>
  );
}
