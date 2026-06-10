import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/Icon";
import type { Size } from "../../tokens";

export enum IconTileTestId {
  Root = "icon-tile-root",
}

export type IconTileSize = "sm" | "md" | "lg" | "xl";
export type IconTileTone = "accent" | "neutral";
export type IconTileRadius = "sm" | "default";
export type IconTileShape = "square" | "circle";

/** Outer tile diameter in px, sealed to a small scale. */
const tilePx: Record<IconTileSize, number> = {
  sm: 30,
  md: 34,
  lg: 44,
  xl: 56,
};

/** Inner glyph size paired to each tile size. */
const innerIcon: Record<IconTileSize, Size> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
};

const toneClass: Record<IconTileTone, string> = {
  accent: "border-accent/30 bg-accent-dim text-accent",
  neutral: "border-border text-foreground-faint",
};

/** Outline (unfilled) variant: a stronger border, no background. */
const outlineToneClass: Record<IconTileTone, string> = {
  accent: "border-accent text-accent",
  neutral: "border-border text-foreground-faint",
};

const radiusClass: Record<IconTileRadius, string> = {
  sm: "rounded-sm",
  default: "rounded",
};

export interface IconTileProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "className"
> {
  /** Glyph rendered inside the tile (ignored when `children` is provided). */
  glyph?: IconName;
  size?: IconTileSize;
  tone?: IconTileTone;
  radius?: IconTileRadius;
  shape?: IconTileShape;
  /** Filled tile (background tint) when true; outline-only when false. */
  filled?: boolean;
  /** Add the accent glow halo (used for "launched"/confirmation states). */
  glow?: boolean;
  /** Render hover/focus affordances; pair with `as="button"` for click targets. */
  interactive?: boolean;
  as?: "span" | "div" | "button";
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/**
 * A bordered, centered frame holding a single glyph — the recurring "accent
 * icon tile" used across cards, modals and empty states.
 */
export function IconTile({
  glyph,
  size = "md",
  tone = "accent",
  radius = "sm",
  shape = "square",
  filled = true,
  glow = false,
  interactive = false,
  as: Tag = "span",
  children,
  style,
  ref,
  ...rest
}: IconTileProps) {
  const px = tilePx[size];
  return (
    <Tag
      className={cn(
        "grid shrink-0 place-items-center border",
        shape === "circle" ? "rounded-full" : radiusClass[radius],
        filled ? toneClass[tone] : outlineToneClass[tone],
        glow && "shadow-glow-accent",
        interactive &&
          cn(
            "cursor-pointer transition-colors hover:border-accent/35 hover:text-foreground",
            focusRing,
          ),
      )}
      data-testid={IconTileTestId.Root}
      ref={ref as Ref<HTMLSpanElement & HTMLDivElement & HTMLButtonElement>}
      style={{ width: px, height: px, ...style }}
      {...rest}
    >
      {children ?? (glyph ? <Icon name={glyph} size={innerIcon[size]} /> : null)}
    </Tag>
  );
}
