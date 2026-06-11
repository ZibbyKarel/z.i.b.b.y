"use client";

import type { LimitWindow, Limits } from "@zibby/contracts";
import {
  Container,
  Icon,
  Progress,
  type ProgressTone,
  Stack,
  Typography,
  getUsageTone,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useLimitsQuery } from "../../../features/limits/queries";
import { useNow } from "../../../hooks/useNow";
import type { MessageKey } from "../../../i18n/keys";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../../../utils/time";
import { HudPanel } from "../../HudPanel/HudPanel";

const CLAUDE_LIMITS: Limits = {
  rolling: { usedPct: 0, resetsAt: null },
  weekly: { usedPct: 0, resetsAt: null },
  capturedAt: null,
  stale: false,
};

type Tone = "ok" | "warn" | "bad" | "accent";
const asTone = (t: ProgressTone): Tone => t as Tone;

/** Per-CSS-var color for a tone — used for the subtle tinted block border. */
const toneVar: Record<Tone, string> = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  accent: "var(--color-accent)",
};

/**
 * Format the time from `now` until `resetsAt` (both epoch ms) as a compact
 * `"6d 12h 4m"`, dropping any zero-valued part (so a sub-day span reads
 * `"12h 4m"` and a sub-hour span `"4m"`). Returns `null` when the reset is
 * unknown (`resetsAt == null`) or already elapsed — the caller then renders the
 * "unknown" copy instead. Locale-agnostic on purpose (bare numbers + d/h/m).
 */
export function formatResetIn(
  resetsAt: number | null,
  now: number,
): string | null {
  if (resetsAt == null) return null;
  const remaining = resetsAt - now;
  if (remaining <= 0) return null;
  const d = Math.floor(remaining / DAY_MS);
  const h = Math.floor((remaining % DAY_MS) / HOUR_MS);
  const m = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  // Always keep minutes when nothing larger survived, so we never render "".
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

/** Reset-countdown tick. */
const NOW_TICK_MS = 30_000;

interface LimitPanelProps {
  /** Catalog key for the window's title (e.g. `limits.rollingLabel`). */
  label: MessageKey;
  /** When this window's utilization resets (epoch ms), or `null` if unknown. */
  resetsAt: number | null;
  /** Server-computed utilization for this window, as a whole percent. */
  usedPct: number;
  /** Current epoch ms (ticking), used to compute the reset countdown. */
  now: number;
}

/**
 * Prominent block for a single interactive limit. Presentation-only: it takes the
 * window's title key plus the live `usedPct`/`resetsAt` and renders the readout,
 * formatting `resetsAt` into a human-readable countdown (`"6d 12h 4m"`). The
 * {@link RollingLimitPanel} / {@link WeeklyLimitPanel} wrappers bind the per-window
 * title.
 */
function LimitPanel({ label, resetsAt, usedPct, now }: LimitPanelProps) {
  const t = useTranslations();
  const tone = getUsageTone(usedPct);
  const color = toneVar[asTone(tone)];
  const resetIn = formatResetIn(resetsAt, now);
  return (
    <Container
      grow
      minW0
      style={{
        flex: "1 1 0",
        padding: "13px 14px",
        background: "var(--color-background)",
        border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
        borderRadius: "var(--radius-sm)",
        boxShadow: `0 0 18px color-mix(in srgb, ${color} 8%, transparent)`,
      }}
    >
      <Stack gap="100">
        <Typography
          mono
          nowrap
          uppercase
          size="xs"
          tracking="wide"
          type="note"
          variant="secondary"
        >
          {t(label)}
        </Typography>
        <Stack align="baseline" direction="row" gap="25">
          <Typography
            mono
            leading="tight"
            size="4xl"
            tone={asTone(tone)}
            type="note"
            weight="bold"
          >
            {usedPct}
          </Typography>
          <Typography
            mono
            size="xl"
            tone={asTone(tone)}
            type="note"
            weight="bold"
          >
            %
          </Typography>
        </Stack>
        <Container>
          <Progress
            height="75"
            label={t(label)}
            tone={tone}
            value={usedPct}
          />
        </Container>
        {resetIn && (
          <Stack align="center" direction="row" gap="25">
            <Icon name="retry" size="xs" tone="faint" />
            <Typography mono truncate size="xs" type="note" variant="tertiary">
              {resetIn}
            </Typography>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

/** The rolling 5-hour window — binds its catalog keys onto {@link LimitPanel}. */
function RollingLimitPanel({
  window,
  now,
}: {
  window: LimitWindow;
  now: number;
}) {
  return (
    <LimitPanel
      label="limits.rollingLabel"
      now={now}
      resetsAt={window.resetsAt}
      usedPct={window.usedPct}
    />
  );
}

/** The weekly window — binds its catalog keys onto {@link LimitPanel}. */
function WeeklyLimitPanel({
  window,
  now,
}: {
  window: LimitWindow;
  now: number;
}) {
  return (
    <LimitPanel
      label="limits.weeklyLabel"
      now={now}
      resetsAt={window.resetsAt}
      usedPct={window.usedPct}
    />
  );
}

/**
 * The dashboard limits panel — the interactive Claude limits (rolling 5h and
 * weekly), computed from real local usage and polled live. Lives at the top of
 * the right rail (it moved out of the top bar).
 */
export function LimitsPanel() {
  const t = useTranslations();
  // Before the first successful poll `data` is undefined; fall back to the static
  // zero-usage config so the panel always renders and never flashes empty.
  const { data } = useLimitsQuery();
  const limits = data ?? CLAUDE_LIMITS;
  const now = useNow(NOW_TICK_MS);

  return (
    <HudPanel
      action={
        <Typography mono size="2xs" type="note" variant="tertiary">
          {t("limits.fromChat")}
        </Typography>
      }
      title={t("limits.panelTitle")}
    >
      <Stack direction="row" gap="100">
        <RollingLimitPanel now={now} window={limits.rolling} />
        <WeeklyLimitPanel now={now} window={limits.weekly} />
      </Stack>
    </HudPanel>
  );
}
