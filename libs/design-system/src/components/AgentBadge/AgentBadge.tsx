import type { ReactNode } from "react";
import type { IconName } from "../Icon/Icon";
import { IconTile, type IconTileSize } from "../IconTile/IconTile";
import { type DotTone, StatusDot } from "../StatusDot/StatusDot";
import { Typography } from "../Typography/Typography";

export enum AgentBadgeTestId {
  Root = "agent-badge-root",
  Dot = "agent-badge-dot",
  Label = "agent-badge-label",
}

export interface AgentBadgeProps {
  /** Agent symbol — a DS icon name (agent glyph → department icon → `bot`). */
  glyph?: IconName;
  /** Hex colour tinting the tile (the agent's department colour). */
  color?: string;
  /** Run state — renders a status dot on the tile's corner. Omit for none. */
  state?: DotTone;
  /** Name shown beside the tile. */
  label?: ReactNode;
  size?: IconTileSize;
  /** Let the state dot animate (live run). */
  pulse?: boolean;
}

/**
 * The agent symbol: an {@link IconTile} (glyph + department colour) with an
 * optional run-state dot and name. Replaces the old per-seed AgentGlyph.
 */
export function AgentBadge({
  glyph = "bot",
  color,
  state,
  label,
  size = "sm",
  pulse = false,
}: AgentBadgeProps) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2" data-testid={AgentBadgeTestId.Root}>
      <span className="relative inline-flex shrink-0">
        <IconTile color={color} glyph={glyph} size={size} />
        {state && (
          <span className="absolute -right-0.5 -bottom-0.5" data-testid={AgentBadgeTestId.Dot}>
            <StatusDot pulse={pulse} tone={state} />
          </span>
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
