/* eslint-disable react/forbid-dom-props -- The orb is a bespoke HUD visual: the
   core disk's radial gradient/border glow, the brand-icon overlay, and the
   canvas layer's absolute positioning are all genuinely dynamic or brand values
   with no DS prop equivalent, so it uses the sanctioned style escape hatch —
   file-level rather than per-line. */
"use client";

import dynamic from "next/dynamic";
import { BrandIcon } from "../../../components/BrandIcon";

const S = 264;

export enum ChatOrbTestId {
  Root = "chat-orb",
  /** The static core disk — also the dynamic-import loading placeholder (see
   * the module doc comment on {@link OrbCoreFallback}). */
  Fallback = "chat-orb-fallback",
}

/**
 * The orb's derived visual state, computed in {@link ChatScreen} purely from the
 * chat stream + composer signals (see `Rozhodnutí 1` in the phase-14 plan) — never
 * a store of its own.
 */
export type ChatOrbMode = "idle" | "listening" | "thinking" | "streaming" | "tool";

export interface ChatOrbProps {
  /** Derived conversation state driving the orb's visual — see {@link ChatOrbMode}. */
  mode?: ChatOrbMode;
}

/**
 * Per-mode visual tuning for the HTML layers (core disk + brand icon). The
 * sphere itself (color/noise/rotation) isn't mode-driven yet — that lands in
 * Fáze 15.3 once the full 7-mode union + color mapping is in place.
 */
interface ChatOrbVisual {
  /** `v-breath`/`v-glow-idle` cycle length; only used when `hot` is false. */
  breathS: number;
  /** Brand-icon overlay opacity. */
  iconOpacity: number;
  /** Core disk border alpha. */
  coreBorderOpacity: number;
  /** Hot = `v-glow-hot` core glow (thinking/streaming/tool — an action is
   * running or tokens are flowing). Idle/listening breathe instead. */
  hot: boolean;
}

// thinking/streaming/tool previously diverged on SVG-only signals (orbit speed,
// ripple rings) that no longer exist now the sphere replaces the flat orbits —
// all three "busy" modes share this one visual until Fáze 15.3 gives the sphere
// itself per-mode color/dynamics.
const BUSY_VISUAL: ChatOrbVisual = {
  breathS: 3.8,
  iconOpacity: 1,
  coreBorderOpacity: 0.33,
  hot: true,
};

/** Lookup keyed by mode — durations/opacities only, no scattered ternaries. */
const MODE_VISUALS: Record<ChatOrbMode, ChatOrbVisual> = {
  idle: { breathS: 3.8, iconOpacity: 0.85, coreBorderOpacity: 0.13, hot: false },
  // Idle base but slightly awakened: quicker breath cycle — the operator is typing.
  listening: { breathS: 2.6, iconOpacity: 0.85, coreBorderOpacity: 0.13, hot: false },
  thinking: BUSY_VISUAL,
  streaming: BUSY_VISUAL,
  tool: BUSY_VISUAL,
};

// Dynamic import so three.js + @react-three/fiber never load in SSR or jsdom
// component tests, and never ship in the HUD's initial bundle — the loading
// fallback is `null` because the core disk below is ALWAYS rendered (it is not
// just a transient placeholder), so there is nothing to show while the chunk
// downloads.
const ChatOrbSphereLazy = dynamic(
  () => import("./ChatOrbSphere").then((mod) => ({ default: mod.ChatOrbSphere })),
  { ssr: false, loading: () => null },
);

/**
 * The static core disk: today's radial-gradient "core orb" minus the SVG orbit
 * rings/ticks/ripples it used to sit inside (the wireframe sphere replaces
 * those). Rendered unconditionally — it doubles as the dynamic-import loading
 * placeholder for {@link ChatOrbSphereLazy} (so there is never a blank flash
 * before the WebGL chunk resolves) and as the permanent inner glow the brand
 * icon sits on, with the sphere as a shell around/behind it.
 */
function OrbCoreFallback({ hot, breathS, coreBorderOpacity, iconOpacity }: ChatOrbVisual) {
  return (
    <div
      data-testid={ChatOrbTestId.Fallback}
      style={{
        position: "absolute",
        inset: 34,
        borderRadius: "50%",
        background: "radial-gradient(circle at 38% 32%, #121d32, var(--color-background) 75%)",
        border: `1.5px solid rgba(91,141,239,${coreBorderOpacity})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "border-color 0.4s",
        animation: hot
          ? "v-glow-hot 1.5s ease-in-out infinite"
          : `v-breath ${breathS}s ease-in-out infinite, v-glow-idle ${breathS}s ease-in-out infinite`,
      }}
    >
      <BrandIcon opacity={iconOpacity} size={150} />
    </div>
  );
}

/**
 * The central JARVIS-style orb, carried over from the old Voice UI as ZIBBY's
 * ambient presence behind the conversation: a lazy-loaded r3f wireframe sphere
 * (see {@link ChatOrbSphereLazy}) wrapping a static core disk with the brand
 * icon centered on top. Driven entirely by `mode` (render-only) — see
 * {@link ChatOrbMode}.
 */
export function ChatOrb({ mode = "idle" }: ChatOrbProps) {
  const v = MODE_VISUALS[mode];

  return (
    <div data-mode={mode} data-testid={ChatOrbTestId.Root} style={{ position: "relative", width: S, height: S }}>
      {/* Wireframe sphere — fills the box, behind the core disk. */}
      <div style={{ position: "absolute", inset: 0 }}>
        <ChatOrbSphereLazy />
      </div>

      {/* Static core + brand icon, always on top of the sphere. */}
      <OrbCoreFallback {...v} />
    </div>
  );
}
