/**
 * Surface layer — pure functions that translate visual props to CSSProperties.
 * No hooks, no React. Import these inside components alongside useTokens().
 */
import type { CSSProperties } from "react";
import type { DesignTokens } from "./tokens";

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export type BgValue =
  | "canvas"
  | "surface"
  | "elevated"
  | "raised"
  | "hover"
  | "accentSoft"
  | "accent"
  | "backdrop"
  | "transparent";

export function bgValue(bg: BgValue | undefined, t: DesignTokens): string | undefined {
  if (bg === undefined) return undefined;
  const m: Record<BgValue, string> = {
    canvas:      t.color.bg.canvas,
    surface:     t.color.bg.surface,
    elevated:    t.color.bg.elevated,
    raised:      t.color.bg.raised,
    hover:       t.color.bg.hover,
    accentSoft:  t.color.surface.accentSoft,
    accent:      t.color.accent.active,
    backdrop:    "rgba(0,0,0,0.55)",
    transparent: "transparent",
  };
  return m[bg];
}

// ---------------------------------------------------------------------------
// Border
// ---------------------------------------------------------------------------

export type BorderTone = "default" | "strong" | "accent" | "accent-dim" | "none";

export function borderColorValue(tone: BorderTone | undefined, t: DesignTokens): string | undefined {
  if (tone === undefined) return undefined;
  const m: Record<BorderTone, string> = {
    default:    t.color.border.default,
    strong:     t.color.border.strong,
    accent:     t.color.accent.active,
    "accent-dim": t.color.accent.activeDim,
    none:       "transparent",
  };
  return m[tone];
}

// ---------------------------------------------------------------------------
// Radius
// ---------------------------------------------------------------------------

export type RadiusValue = "none" | "sm" | "default" | "md" | "lg" | "xl" | "2xl" | "full";

export function radiusValue(radius: RadiusValue | undefined, t: DesignTokens): string | undefined {
  if (radius === undefined) return undefined;
  const m: Record<RadiusValue, string> = {
    none:    "0",
    sm:      t.size.radiusSm,
    default: t.size.radius,
    md:      t.size.radiusMd,
    lg:      t.size.radiusLg,
    xl:      "11px",
    "2xl":   "12px",
    full:    t.size.radiusFull,
  };
  return m[radius];
}

// ---------------------------------------------------------------------------
// Shadow
// ---------------------------------------------------------------------------

export type ShadowValue = "none" | "sm" | "card" | "lg" | "modal" | "glow";

export function shadowValue(shadow: ShadowValue | undefined, t: DesignTokens): string | undefined {
  if (shadow === undefined) return undefined;
  const m: Record<ShadowValue, string> = {
    none:  "none",
    sm:    t.size.shadowSm,
    card:  t.size.shadowCard,
    lg:    t.size.shadowLg,
    modal: t.size.shadowModal,
    glow:  t.size.shadowGlow,
  };
  return m[shadow];
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

export interface VisualStyleProps {
  background?: BgValue;
  borderColor?: BorderTone;
  borderWidth?: string;
  radius?: RadiusValue;
  shadow?: ShadowValue;
}

/** Composes all visual props into a CSSProperties object. Only sets keys
 *  whose prop is non-undefined (safe to merge with inline styles). */
export function computeVisualStyle(
  props: VisualStyleProps,
  t: DesignTokens,
): CSSProperties {
  const style: CSSProperties = {};
  const bg = bgValue(props.background, t);
  const bc = borderColorValue(props.borderColor, t);
  const r  = radiusValue(props.radius, t);
  const sh = shadowValue(props.shadow, t);

  if (bg !== undefined) style.backgroundColor = bg;
  if (bc !== undefined) {
    style.borderColor = bc;
    style.borderStyle = "solid";
    style.borderWidth = props.borderWidth ?? "1px";
  }
  if (r  !== undefined) style.borderRadius = r;
  if (sh !== undefined) style.boxShadow = sh;
  return style;
}
