import type { SubsystemId, SubsystemState, SubsystemWithStatus } from "@zibby/contracts";
import { cn } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { KeyboardEvent } from "react";
import { usePrefersReducedMotion } from "../../../chat/hooks/usePrefersReducedMotion";
import {
  NODE_RADIUS,
  ORB_RADIUS,
  WEB_CENTER,
  WEB_RX,
  WEB_RY,
  WEB_VIEWBOX_HEIGHT,
  WEB_VIEWBOX_WIDTH,
  computeSlots,
  layoutSubsystems,
  rimEdges,
  rimPath,
  slotForId,
  spokePath,
} from "./subsystem-web-geometry";

export enum SubsystemWebTestId {
  Root = "subsystem-web-root",
  Orb = "subsystem-web-orb",
  Spokes = "subsystem-web-spokes",
  Rim = "subsystem-web-rim",
  Particles = "subsystem-web-particles",
  /** Per subsystem: `${Node}-${id}`. */
  Node = "subsystem-web-node",
  /** Per subsystem: `${Badge}-${id}`. */
  Badge = "subsystem-web-badge",
}

export interface SubsystemWebProps {
  subsystems: SubsystemWithStatus[];
  selectedId?: SubsystemId | null;
  onSelect: (id: SubsystemId) => void;
}

/** Fill opacity per state — `klid` reads dim, everything else full-strength; the
 * pulse/ring/badge layers (not opacity) carry the rest of the state distinction. */
const FILL_OPACITY: Record<SubsystemState, number> = {
  klid: 0.35,
  bezi: 1,
  hlaseni: 1,
  ceka: 1,
};

/** Node-fill pulse class per state. `klid`/`hlaseni` are static (no motion) —
 * `hlaseni` reads calm on purpose (the report is ready, nothing urgent); `bezi` and
 * `ceka` both breathe gently in place via the shared `zt-live` opacity keyframe
 * (`StatusDot`'s own "live" animation), `ceka` additionally gets the louder outer
 * ring below so it still reads as more urgent than `bezi` at a glance. */
const NODE_PULSE_CLASS: Record<SubsystemState, string> = {
  klid: "",
  bezi: "animate-live motion-reduce:animate-none",
  hlaseni: "",
  ceka: "animate-live motion-reduce:animate-none",
};

/** Badge tone per state — `hlaseni` (a Tier-2 report, already handled) reads calm
 * `ok`; `ceka` (a Tier-3 decision waiting on the operator) reads urgent `warn`. */
const BADGE_TONE_CLASS: Record<"hlaseni" | "ceka", string> = {
  hlaseni: "fill-ok",
  ceka: "fill-warn",
};

const SLOTS = computeSlots();
const RIM_EDGES = rimEdges();

/**
 * The subsystem web (Phase 83, design doc "the web, not an orbit"): 8 fixed nodes on a
 * flattened ellipse, one per named subsystem, a ZIBBY orb at the center, thin static
 * spokes (center→node) and a faint rim (neighbor→neighbor). A NEW SVG/DOM layer over
 * the existing `CosmicScene` — the design's whole argument against orbiting sub-agents
 * was clickability, so this is real hit-targets and keyboard focus, not a WebGL scene.
 * Nodes never move: their geometry comes from {@link computeSlots}/{@link layoutSubsystems},
 * keyed by the subsystem's rank in the canonical registry, not by array position — the
 * `subsystems` prop may arrive severity-sorted (or momentarily short an entry) without
 * ever reflowing the web.
 *
 * Per-state rendering: `klid` dim and static, `bezi` a subtle in-place pulse in the
 * subsystem's own color, `hlaseni` calm (static) plus a tier2Count badge, `ceka` the
 * same in-place pulse as `bezi` PLUS a louder, faster-pulsing outer ring in the shared
 * urgent `warn` tone plus a tier3Count badge — so it reads louder than `bezi` at a
 * glance without relying on a scale transform (SVG's default transform-origin isn't the
 * shape's own center, so nothing here animates `transform`; only opacity/stroke).
 *
 * The orb is decorative in v1 (not a button); each node is a focusable, clickable `<g
 * role="button">` — SVG doesn't support a real `<button>` element without `foreignObject`,
 * and `role="button"` + `tabIndex` + `Enter`/`Space` handling is the standard accessible
 * pattern for an interactive SVG shape. Selecting a node just sets the selection ring
 * (Phase 84's drawer will consume `selectedId`) — no navigation yet.
 */
export function SubsystemWeb({ subsystems, selectedId = null, onSelect }: SubsystemWebProps) {
  const t = useTranslations("subsystems");
  const reducedMotion = usePrefersReducedMotion();
  const positioned = layoutSubsystems(subsystems);

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>, id: SubsystemId) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <div
      aria-label={t("ariaLabel")}
      className="relative h-full w-full"
      data-testid={SubsystemWebTestId.Root}
      role="group"
    >
      <svg
        className="h-full w-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
        viewBox={`0 0 ${WEB_VIEWBOX_WIDTH} ${WEB_VIEWBOX_HEIGHT}`}
      >
        {/* A soft, static backdrop so the web reads legibly over the nebula behind it
            — the same "fade to something readable" idea as the transcript's top mask,
            just a flat low-opacity ellipse instead of a gradient (no CSS var()
            resolution risk inside an SVG attribute). Purely decorative. */}
        <ellipse
          aria-hidden="true"
          className="fill-background"
          cx={WEB_CENTER.x}
          cy={WEB_CENTER.y}
          opacity={0.4}
          rx={WEB_RX * 1.08}
          ry={WEB_RY * 1.7}
        />

        {/* Spokes: center → each fixed slot. Thin, faint, static. */}
        <g aria-hidden="true" data-testid={SubsystemWebTestId.Spokes}>
          {SLOTS.map((slot) => (
            <path
              className="stroke-foreground-faint"
              d={spokePath(slot)}
              fill="none"
              key={`spoke-${slot.index}`}
              opacity={0.22}
              strokeWidth={1}
            />
          ))}
        </g>

        {/* Rim: ellipse-neighbor → ellipse-neighbor. Even fainter than the spokes —
            it's ambient structure, not a primary read. */}
        <g aria-hidden="true" data-testid={SubsystemWebTestId.Rim}>
          {RIM_EDGES.map(([fromId, toId]) => {
            const a = slotForId(fromId);
            const b = slotForId(toId);
            if (!a || !b) return null;
            return (
              <path
                className="stroke-foreground-faint"
                d={rimPath(a, b)}
                fill="none"
                key={`rim-${fromId}-${toId}`}
                opacity={0.12}
                strokeWidth={1}
              />
            );
          })}
        </g>

        {/* Reserved for Phase 89's particle layer — nothing animated here yet. */}
        <g aria-hidden="true" data-testid={SubsystemWebTestId.Particles} />

        {/* The ZIBBY orb — not interactive in v1, diameter ≈ 2× a node's. */}
        <g aria-hidden="true" data-testid={SubsystemWebTestId.Orb}>
          <circle className="fill-accent" cx={WEB_CENTER.x} cy={WEB_CENTER.y} opacity={0.14} r={ORB_RADIUS * 1.4} />
          <circle className="fill-accent" cx={WEB_CENTER.x} cy={WEB_CENTER.y} opacity={0.9} r={ORB_RADIUS} />
        </g>

        {/* The 8 subsystem nodes — the only interactive layer. */}
        {positioned.map((p) => {
          const selected = selectedId === p.id;
          const stateLabel = t(`state.${p.state}`);
          let ariaLabel = t("nodeAria", { name: p.name, state: stateLabel });
          if (p.state === "hlaseni" && p.tier2Count > 0) {
            ariaLabel += ` ${t("tier2Badge", { count: p.tier2Count })}`;
          }
          if (p.state === "ceka" && p.tier3Count > 0) {
            ariaLabel += ` ${t("tier3Badge", { count: p.tier3Count })}`;
          }
          const badgeCount = p.state === "hlaseni" ? p.tier2Count : p.state === "ceka" ? p.tier3Count : 0;

          return (
            <g
              aria-label={ariaLabel}
              aria-pressed={selected}
              className="cursor-pointer outline-none"
              data-testid={`${SubsystemWebTestId.Node}-${p.id}`}
              key={p.id}
              onClick={() => onSelect(p.id)}
              onKeyDown={(event) => handleKeyDown(event, p.id)}
              role="button"
              tabIndex={0}
            >
              {/* Ceka's extra urgent ring — louder AND faster than the bezi/ceka
                  shared in-place pulse below, so ceka reads more urgent than bezi at
                  a glance even before the badge is read. Reduced motion keeps it
                  statically visible (no animation) rather than hiding it — the
                  emphasis is still there, just not moving. */}
              {p.state === "ceka" && (
                <circle
                  className={cn(
                    "fill-none stroke-warn",
                    !reducedMotion && "animate-[zt-live_1.1s_ease-in-out_infinite]",
                  )}
                  cx={p.x}
                  cy={p.y}
                  opacity={0.85}
                  r={NODE_RADIUS + 7}
                  strokeWidth={3}
                />
              )}

              {/* Selection ring — dashed, accent-toned, independent of state. */}
              {selected && (
                <circle
                  className="fill-none stroke-accent"
                  cx={p.x}
                  cy={p.y}
                  opacity={0.95}
                  r={NODE_RADIUS + 10}
                  strokeDasharray="3 4"
                  strokeWidth={2}
                />
              )}

              <circle
                className={NODE_PULSE_CLASS[p.state]}
                cx={p.x}
                cy={p.y}
                fill={p.color}
                fillOpacity={FILL_OPACITY[p.state]}
                r={NODE_RADIUS}
              />

              {badgeCount > 0 && (
                <g data-testid={`${SubsystemWebTestId.Badge}-${p.id}`}>
                  <circle
                    className={BADGE_TONE_CLASS[p.state as "hlaseni" | "ceka"]}
                    cx={p.x + NODE_RADIUS * 0.72}
                    cy={p.y - NODE_RADIUS * 0.72}
                    r={9}
                  />
                  <text
                    className="fill-background font-mono font-semibold"
                    fontSize={10}
                    textAnchor="middle"
                    x={p.x + NODE_RADIUS * 0.72}
                    y={p.y - NODE_RADIUS * 0.72 + 3.5}
                  >
                    {badgeCount}
                  </text>
                </g>
              )}

              <text
                className="fill-foreground-dim font-mono"
                fontSize={9}
                textAnchor="middle"
                x={p.x}
                y={p.y + NODE_RADIUS + 13}
              >
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
