"use client";

import type { CSSProperties, ReactNode } from "react";

export enum GlassSurfaceTestId {
  Root = "glass-surface",
}

export interface GlassSurfaceProps {
  /** Corner rounding: control 6px · panel 10px · pill 9999px. Defaults to "panel". */
  radius?: "control" | "panel" | "pill";
  children?: ReactNode;
  /** Merge passthrough for genuinely dynamic values (position, width). */
  style?: CSSProperties;
  "data-testid"?: string;
}

const RADIUS_PX: Record<NonNullable<GlassSurfaceProps["radius"]>, string> = {
  control: "6px",
  panel: "10px",
  pill: "9999px",
};

/**
 * The Velín-D "liquid glass" surface: a translucent, blurred pane over the scene
 * gradient. The single home of the VD_GLASS recipe so no app node hand-rolls
 * backdrop-filter. Immersive-bundle convention: inline style is allowed here (the
 * forbid-dom-props rule targets apps/web, not the DS). Unlike its animated bundle
 * siblings it does NOT call ensureImmersiveCss() — that injector exists for the
 * im* keyframes, and this component uses no animation.
 */
export function GlassSurface({
  radius = "panel",
  children,
  style,
  "data-testid": testId = GlassSurfaceTestId.Root,
}: GlassSurfaceProps) {
  return (
    <div
      data-testid={testId}
      style={{
        background: "var(--gradient-glass)",
        backdropFilter: "var(--blur-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
        border: "1px solid var(--color-glass-border)",
        boxShadow: "var(--shadow-glass)",
        borderRadius: RADIUS_PX[radius],
        ...style,
      }}
    >
      {children}
    </div>
  );
}
