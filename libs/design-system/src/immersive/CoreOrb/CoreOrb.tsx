import type { KeyboardEvent } from "react";
import { useCallback, useEffect } from "react";
import { ensureImmersiveCss } from "../immersive.css";
import { Orb } from "../Orb/Orb";
import { OrbitField } from "../OrbitField/OrbitField";

export enum CoreOrbTestId {
  Root = "core-orb-root",
  Orb = "core-orb-orb",
  Wordmark = "core-orb-wordmark",
  Ring = "core-orb-ring",
  Glow = "core-orb-glow",
}

export interface CoreOrbProps {
  /** Root diameter in px — every other dimension (orb body, rings, glow, orbit radius) derives from it. */
  size: number;
  /** Identity color for the orb body, heartbeat rings, and glow. */
  hex?: string;
  /** Baseline heartbeat intensity (roughly a 0..0.7 domain); callers derive this from active work. */
  intensity?: number;
  /** Controlled "responding" flag — replaces the ported prototype's internal timer. */
  thinking?: boolean;
  /** Orbit-field dot count — defaults to the fixed core count of 4. */
  activeCount?: number;
  onClick?: () => void;
  ref?: React.Ref<HTMLDivElement>;
}

const WORDMARK_LETTERS = ["Z", "I", "B", "B", "Y"];

/**
 * Central ZIBBY orb — WebGL wireframe body, wordmark overlay, two heartbeat rings whose
 * cadence rises with `intensity`/`thinking`, a soft breathing glow, and a fixed-count
 * orbit field. Ported from `VcCoreD` (`design/Z.I.B.B.Y/zibby/velin-d-map.jsx`); the
 * prototype's internal `responding` `setInterval`/`setTimeout` is replaced by the
 * controlled `thinking` prop — no timers live in this component.
 *
 * The root is a `div[role="button"]` (not a native `<button>`) so its ref type stays
 * `HTMLDivElement` per the produced contract — `tabIndex`/`onKeyDown` (Enter/Space)
 * give it the same keyboard affordance a native button would.
 */
export function CoreOrb({
  size,
  hex = "#5b8def",
  intensity = 0.4,
  thinking = false,
  activeCount = 4,
  onClick,
  ref,
}: CoreOrbProps) {
  useEffect(() => {
    ensureImmersiveCss();
  }, []);

  const lvl = Math.min(1, intensity + (thinking ? 0.5 : 0));
  const orbState = thinking ? "thinking" : "idle";

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onClick?.();
    },
    [onClick],
  );

  return (
    <div
      aria-label="ZIBBY overview"
      data-testid={CoreOrbTestId.Root}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      ref={ref}
      role="button"
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        cursor: "pointer",
      }}
      tabIndex={0}
      title="ZIBBY overview"
    >
      {/* Expanding heartbeat — cadence rises with activity. */}
      {[0, 1].map((i) => (
        <span
          data-testid={`${CoreOrbTestId.Ring}-${i}`}
          key={i}
          style={{
            position: "absolute",
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: "50%",
            border: `1px solid ${hex}`,
            pointerEvents: "none",
            animation: `imRing ${(3.6 - lvl * 1.4).toFixed(1)}s ease-out ${(i * (1.8 - lvl * 0.7)).toFixed(1)}s infinite`,
          }}
        />
      ))}
      {/* Soft glow — brightens while thinking. */}
      <span
        data-testid={CoreOrbTestId.Glow}
        style={{
          position: "absolute",
          width: size * 1.5,
          height: size * 1.5,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${hex}${thinking ? "3a" : "20"} 0%, transparent 66%)`,
          transition: "background .8s",
          pointerEvents: "none",
        }}
      />
      {/* 3D orchestration orbits. */}
      <OrbitField baseRadius={size * 0.42} color={hex} count={activeCount} seed="core" />
      {/* WebGL orb. */}
      <div data-testid={CoreOrbTestId.Orb}>
        <Orb antialias detail={4} diameter={size * 0.66} hex={hex} state={orbState} />
      </div>
      {/* Brand wordmark — centered, interpunct dots vertically aligned mid-line. */}
      <div
        data-testid={CoreOrbTestId.Wordmark}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: Math.max(11, size * 0.083),
            fontWeight: 400,
            letterSpacing: "0.03em",
            color: "#eef3fb",
            textAlign: "center",
            textShadow: "0 1px 8px rgba(0,0,0,.45)",
          }}
        >
          {WORDMARK_LETTERS.map((letter, i) => (
            <span key={`${letter}-${i}`}>
              {letter}
              {i < WORDMARK_LETTERS.length - 1 && (
                <span style={{ verticalAlign: "middle" }}>&middot;</span>
              )}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
