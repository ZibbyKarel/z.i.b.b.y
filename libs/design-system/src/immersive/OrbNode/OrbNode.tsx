"use client";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo } from "react";
import { ensureImmersiveCss } from "../immersive.css";
import { Orb } from "../Orb/Orb";
import { OrbitField } from "../OrbitField/OrbitField";
import { ORB_STATE, type OrbState } from "../orbState";
import { seededRandom } from "../seededRandom";

export enum OrbNodeTestId {
  Root = "orb-node-root",
  Orb = "orb-node-orb",
  Icon = "orb-node-icon",
  Label = "orb-node-label",
  Halo = "orb-node-halo",
  Ping = "orb-node-ping",
  Shadow = "orb-node-shadow",
}

export interface OrbNodeProps {
  /** Target orb diameter in px — every chrome layer (shadow, halo, ping, orbit) derives from it. */
  diameter: number;
  /** Identity color of the orb body. */
  hex: string;
  /** Conversational/subsystem state — selects motion, chrome color, and ping visibility. */
  state: OrbState;
  /** Subsystem name shown under the orb. */
  label: string;
  /** Accessible name for the root button — defaults to `label` when omitted.
   * Lets a caller announce more than what's visually shown (e.g. name + state)
   * without painting that extra text on the map itself. */
  ariaLabel?: string;
  /** Icon overlay rendered centered on the orb body. */
  icon: ReactNode;
  /** Number of active tasks — drives the {@link OrbitField} dot count. */
  activeCount: number;
  /** Stable identity used to seed the float animation and the orbit layout. */
  nodeId: string;
  onClick?: () => void;
  ref?: React.Ref<HTMLDivElement>;
}

interface FloatConfig {
  dur: string;
  delay: string;
}

/** Deterministic per-node float timing so the same node always drifts the same way. */
function buildFloatConfig(nodeId: string): FloatConfig {
  const rand = seededRandom(nodeId);
  return { dur: (5 + rand() * 3).toFixed(1), delay: (rand() * 4).toFixed(1) };
}

/**
 * A composed subsystem node: a WebGL {@link Orb} (identity color) wrapped in state
 * chrome — a contact shadow, an {@link OrbitField} of active-task dots, a state-colored
 * halo, an attention ping for `await`/`incident`/`report`, and a per-node seeded float
 * drift — plus a centered icon overlay and a name/status label row.
 *
 * Interactive (click + keyboard activatable). The parent map owns absolute placement,
 * so this renders as a plain relative flex column — it never positions itself.
 *
 * The root is a `div[role="button"]` (not a native `<button>`) so its ref type stays
 * `HTMLDivElement` per the produced contract — `tabIndex`/`onKeyDown` (Enter/Space)
 * give it the same keyboard affordance a native button would (mirrors `CoreOrb`).
 *
 * Ported from `VcNodeD` in the original orb-map prototype.
 */
export function OrbNode({
  diameter,
  hex,
  state,
  label,
  ariaLabel,
  icon,
  activeCount,
  nodeId,
  onClick,
  ref,
}: OrbNodeProps) {
  const st = ORB_STATE[state] ?? ORB_STATE.idle;
  const floatCfg = useMemo(() => buildFloatConfig(nodeId), [nodeId]);
  const showPing = state === "await" || state === "incident" || state === "report";

  useEffect(() => {
    ensureImmersiveCss();
  }, []);

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
      aria-label={ariaLabel ?? label}
      data-testid={OrbNodeTestId.Root}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      ref={ref}
      role="button"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
      }}
      tabIndex={0}
    >
      <div
        className="im-anim"
        style={{
          position: "relative",
          width: diameter + 22,
          height: diameter + 22,
          display: "grid",
          placeItems: "center",
          animation: `imFloat ${floatCfg.dur}s ease-in-out -${floatCfg.delay}s infinite`,
        }}
      >
        {/* Contact shadow — settles the orb into the 3D scene. */}
        <span
          className="im-anim"
          data-testid={OrbNodeTestId.Shadow}
          style={{
            position: "absolute",
            bottom: -14,
            left: "50%",
            width: diameter * 0.86,
            height: 11,
            borderRadius: "50%",
            background: `radial-gradient(50% 50%, ${st.color}44, transparent 72%)`,
            filter: "blur(2px)",
            zIndex: 0,
            pointerEvents: "none",
            animation: st.live ? "imShadow 4s ease-in-out infinite" : "none",
            transform: "translateX(-50%)",
            opacity: 0.45,
          }}
        />
        {/* Faux-3D orbits of the node's active tasks. */}
        <OrbitField
          baseRadius={diameter / 2 + 13}
          color={st.color}
          count={activeCount}
          seed={nodeId}
        />
        {/* State halo — color = STATE, not identity. */}
        <span
          className="im-anim"
          data-testid={OrbNodeTestId.Halo}
          style={{
            position: "absolute",
            width: diameter + 16,
            height: diameter + 16,
            borderRadius: "50%",
            border: `1.5px solid ${st.color}`,
            boxShadow: `0 0 16px ${st.color}55`,
            zIndex: 0,
            animation: st.live
              ? `imHalo ${state === "working" ? 3.4 : 2}s ease-in-out infinite`
              : "none",
            opacity: st.live ? undefined : 0.32,
            pointerEvents: "none",
          }}
        />
        {/* Attention ping — only for states that need the operator's eye. */}
        {showPing && (
          <span
            className="im-anim"
            data-testid={OrbNodeTestId.Ping}
            style={{
              position: "absolute",
              width: diameter + 16,
              height: diameter + 16,
              borderRadius: "50%",
              zIndex: 0,
              border: `1px solid ${st.color}`,
              animation: "imRing 2.4s ease-out infinite",
              pointerEvents: "none",
            }}
          />
        )}
        {/* WebGL orb + identity color, with the icon overlay. */}
        <div
          data-testid={OrbNodeTestId.Orb}
          style={{ position: "relative", width: diameter, height: diameter, zIndex: 2 }}
        >
          <Orb detail={1} diameter={diameter} hex={hex} state={state} />
          <span
            data-testid={OrbNodeTestId.Icon}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 4,
              pointerEvents: "none",
              color: "#eef3fb",
            }}
          >
            {icon}
          </span>
        </div>
      </div>
      {/* Name label. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
          textShadow: "0 2px 8px rgba(0,0,0,0.6)",
        }}
      >
        <span
          data-testid={OrbNodeTestId.Label}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: Math.max(12, Math.min(15, diameter * 0.19)),
            fontWeight: 600,
            color: "var(--color-foreground)",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
