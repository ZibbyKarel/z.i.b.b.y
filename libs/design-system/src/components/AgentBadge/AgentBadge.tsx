import type { ReactNode } from "react";
import { type StateTone, normalizeToneLike } from "../../stateTone";
import { cn } from "../../utils/cn";
import type { IconName } from "../Icon/Icon";
import { IconTile, type IconTileSize } from "../IconTile/IconTile";
import type { DotTone } from "../StatusDot/StatusDot";
import { Typography } from "../Typography/Typography";

export enum AgentBadgeTestId {
  Root = "agent-badge-root",
  /** The state frame drawn around the tile — present only when `state` is set. */
  State = "agent-badge-state",
  Label = "agent-badge-label",
}

/** Frame colour per state — the same hues `StatusDot` paints. */
const stateRing: Record<StateTone | "wait", string> = {
  thinking: "ring-accent",
  done: "ring-ok",
  blocked: "ring-warn",
  error: "ring-bad",
  working: "ring-run",
  idle: "ring-foreground-faint",
  wait: "ring-warn",
};

/** Living frames: `working` breathes, `blocked`/`wait` blink (DS.md §7/§9) — the rest stay matte. */
const stateAnimation: Partial<Record<StateTone | "wait", string>> = {
  working: "animate-zb-live",
  blocked: "animate-zb-pulse",
  wait: "animate-zb-pulse",
};

export interface AgentBadgeProps {
  /** Agent symbol — a DS icon name (agent glyph → department icon → `bot`). */
  glyph?: IconName;
  /** Hex colour filling the tile (the agent's department colour). */
  color?: string;
  /** Run state — renders as a coloured frame around the tile. Omit for none. */
  state?: DotTone;
  /** Name shown beside the tile. */
  label?: ReactNode;
  size?: IconTileSize;
  /** Let the state frame animate (live run). */
  pulse?: boolean;
}

/**
 * The agent symbol: an {@link IconTile} filled with the department colour, the
 * glyph cut out in the panel colour, and the run state as a frame around it.
 */
export function AgentBadge({
  glyph = "bot",
  color,
  state,
  label,
  size = "sm",
  pulse = false,
}: AgentBadgeProps) {
  const fill = color ?? "var(--color-ink-3)";
  const tone = state && normalizeToneLike(state);
  return (
    <span className="inline-flex min-w-0 items-center gap-2" data-testid={AgentBadgeTestId.Root}>
      <span className="relative inline-flex shrink-0">
        <IconTile
          glyph={glyph}
          size={size}
          style={{ backgroundColor: fill, borderColor: fill, color: "var(--color-panel)" }}
        />
        {tone && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 rounded-sm ring-2 ring-offset-1 ring-offset-panel",
              stateRing[tone],
              pulse && stateAnimation[tone],
            )}
            data-state={tone}
            data-testid={AgentBadgeTestId.State}
          />
        )}
      </span>
      {label != null && (
        <Typography truncate data-testid={AgentBadgeTestId.Label} type="text">
          {label}
        </Typography>
      )}
    </span>
  );
}
