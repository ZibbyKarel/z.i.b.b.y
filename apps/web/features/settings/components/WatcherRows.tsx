"use client";

import type { WatcherHealth } from "@zibby/contracts";
import { type DotTone, Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";

/** Testids for the settings System tab's watcher heartbeat rows (NS2 F6c). */
export enum WatcherRowsTestId {
  List = "settings-watchers",
  /** Per-row testid is `${Row}-${watcher.id}`, e.g. `settings-watcher-row-channel`. */
  Row = "settings-watcher-row",
}

/** Visual tone per probe status: ok green, stale is the warning, disabled faint. */
const DOT_TONE: Record<WatcherHealth["status"], DotTone> = {
  ok: "ok",
  stale: "wait",
  disabled: "idle",
};

/**
 * NS2 F6c — the settings-HUD indicator for the five heartbeat watchers, fed by
 * the existing 10s `useHealthQuery` poll. Read-only rows in the System panel:
 * a stale watcher shows the warning tone here (and as a briefing line) — by
 * design it never turns the overall `/health` status red (fail-open).
 */
export function WatcherRows({ watchers }: { watchers?: WatcherHealth[] }) {
  const t = useTranslations("settings");
  if (!watchers || watchers.length === 0) return null;
  return (
    <Stack data-testid={WatcherRowsTestId.List} gap="150">
      <Typography mono size="sm" type="note" variant="tertiary">
        {t("watchers.title")}
      </Typography>
      {watchers.map((w) => (
        <Stack
          align="center"
          data-testid={`${WatcherRowsTestId.Row}-${w.id}`}
          direction="row"
          gap="150"
          justify="between"
          key={w.id}
        >
          <Typography mono size="sm" type="note" variant="tertiary">
            {w.id}
          </Typography>
          <Stack align="center" direction="row" gap="75">
            <StatusDot tone={DOT_TONE[w.status]} />
            <Typography
              mono
              size="sm"
              tone={w.status === "stale" ? "warn" : w.status === "ok" ? "ok" : undefined}
              type="note"
              variant={w.status === "disabled" ? "tertiary" : undefined}
              weight="semibold"
            >
              {t(`watchers.${w.status}`)}
            </Typography>
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
