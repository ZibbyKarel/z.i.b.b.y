import { SUBSYSTEMS, type SubsystemId, type SubsystemState, type SubsystemWithStatus } from "@zibby/contracts";
import { cn } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Pipeline } from "../../../../domain";
import { usePrefersReducedMotion } from "../../../chat/hooks/usePrefersReducedMotion";
import type { RunView } from "../../../runs/run";
import { onRunEvent } from "../../../runs/runEvents";
import { appendParticle, flightForEvent, particleDuration } from "./particle-mapping";
import {
  NODE_RADIUS,
  WEB_CENTER,
  WEB_VIEWBOX_HEIGHT,
  WEB_VIEWBOX_WIDTH,
  computeSlots,
  layoutSubsystems,
  pathFor,
  rimEdges,
  rimPath,
  slotForId,
  spokePath,
} from "./subsystem-web-geometry";

export enum SubsystemWebTestId {
  Root = "subsystem-web-root",
  Spokes = "subsystem-web-spokes",
  Rim = "subsystem-web-rim",
  Particles = "subsystem-web-particles",
  /** One flight/glow glyph. Shared across every live particle — not unique per id,
   * since a particle's id is an opaque event-derived key, not something a test
   * needs to target individually (`getAllByTestId` + count is the assertion shape). */
  Particle = "subsystem-web-particle",
  /** Per subsystem: `${Node}-${id}`. */
  Node = "subsystem-web-node",
  /** Per subsystem: `${Badge}-${id}`. */
  Badge = "subsystem-web-badge",
}

export interface SubsystemWebProps {
  subsystems: SubsystemWithStatus[];
  selectedId?: SubsystemId | null;
  onSelect: (id: SubsystemId) => void;
  /**
   * Phase 89: the catalogs the particle layer resolves a run's owning subsystem
   * through (`runId` → owning pipeline → `ownerSubsystem`). Both already fetched by
   * the Chat screen for other purposes (the constellation roster / dock) — passed
   * in rather than queried again here, so the particle layer adds no new request.
   * Optional/defaulted so every existing call site (and every other test) keeps
   * compiling unchanged.
   */
  pipelines?: Pipeline[];
  runs?: RunView[];
}

/** One live particle: a spoke flight (`animateMotion` along the phase-83 path) or,
 * under `prefers-reduced-motion`, a brief static glow at its destination node. */
interface RenderedParticle {
  id: string;
  from: SubsystemId | "orb";
  to: SubsystemId | "orb";
  /** The owning subsystem's registry color — looked up once at flight creation
   * (not re-derived from the live `subsystems` prop, which can momentarily drop an
   * entry; the static registry always has one for any valid `SubsystemId`). */
  color: string;
  durationS: number;
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

interface ParticleGlyphProps {
  particle: RenderedParticle;
  reducedMotion: boolean;
  onEnd: (id: string) => void;
}

/**
 * One particle's glyph (Phase 89). Full motion: a small dot riding
 * `<animateMotion>` along the exact spoke path {@link pathFor} already draws
 * statically, removed the moment the SMIL animation actually finishes (its native
 * `endEvent`, listened for imperatively — React has no synthetic prop for SMIL
 * events). `prefers-reduced-motion`: no motion at all, just a brief static glow at
 * the flight's destination node (the `ripple` keyframe already in the design
 * system, reused rather than adding a new one), removed on its own CSS
 * `animationend`. Both paths converge on the same `onEnd(particle.id)` callback, so
 * the parent's cap/removal logic doesn't care which path fired it.
 */
function ParticleGlyph({ particle, reducedMotion, onEnd }: ParticleGlyphProps) {
  // Typed as the generic `SVGElement` (not `SVGAnimateMotionElement`) — React's own
  // `animateMotion` JSX typing is `SVGProps<SVGElement>`, so this is the ref shape
  // the element actually accepts; `endEvent` is available on any `EventTarget`.
  const animateRef = useRef<SVGElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const el = animateRef.current;
    if (!el) return;
    const handleEnd = () => onEnd(particle.id);
    el.addEventListener("endEvent", handleEnd);
    return () => el.removeEventListener("endEvent", handleEnd);
  }, [reducedMotion, particle.id, onEnd]);

  if (reducedMotion) {
    const dest = particle.to === "orb" ? WEB_CENTER : slotForId(particle.to);
    if (!dest) return null;
    return (
      <circle
        className="animate-[ripple_0.9s_ease-out_forwards]"
        cx={dest.x}
        cy={dest.y}
        data-testid={SubsystemWebTestId.Particle}
        fill={particle.color}
        onAnimationEnd={() => onEnd(particle.id)}
        opacity={0.85}
        r={6}
      />
    );
  }

  const path = pathFor(particle.from, particle.to);
  if (!path) return null;

  return (
    <circle data-testid={SubsystemWebTestId.Particle} fill={particle.color} opacity={0.95} r={3.2}>
      <animateMotion dur={`${particle.durationS}s`} fill="freeze" path={path} ref={animateRef} />
    </circle>
  );
}

/**
 * The subsystem web (Phase 83, design doc "the web, not an orbit"): 8 fixed nodes on a
 * flattened ellipse, one per named subsystem, thin static spokes (center→node) and a
 * faint rim (neighbor→neighbor). An SVG/DOM overlay concentric with `CosmicScene`'s
 * (half-size) WebGL orb — the orb IS the web's center, so nothing is drawn there here;
 * the spokes radiate straight out of it. The design's whole argument against orbiting
 * sub-agents was clickability, so this is real hit-targets and keyboard focus, not a
 * WebGL scene.
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
 * Each node is a focusable, clickable `<g
 * role="button">` — SVG doesn't support a real `<button>` element without `foreignObject`,
 * and `role="button"` + `tabIndex` + `Enter`/`Space` handling is the standard accessible
 * pattern for an interactive SVG shape. Selecting a node just sets the selection ring
 * (Phase 84's drawer will consume `selectedId`) — no navigation yet.
 */
export function SubsystemWeb({
  subsystems,
  selectedId = null,
  onSelect,
  pipelines = [],
  runs = [],
}: SubsystemWebProps) {
  const t = useTranslations("subsystems");
  const reducedMotion = usePrefersReducedMotion();
  const positioned = layoutSubsystems(subsystems);

  // Phase 89: turn real dispatch/report events into particles. `runs`/`pipelines`
  // are read through refs (not effect deps) so a fresh array reference on every
  // query refetch never tears down and resubscribes the listener — the provider's
  // ONE `EventSource` keeps delivering events the whole time regardless.
  const runsRef = useRef(runs);
  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);
  const pipelinesRef = useRef(pipelines);
  useEffect(() => {
    pipelinesRef.current = pipelines;
  }, [pipelines]);

  const [particles, setParticles] = useState<RenderedParticle[]>([]);
  const particleSeq = useRef(0);

  useEffect(() => {
    return onRunEvent((event) => {
      const flight = flightForEvent(event, runsRef.current, pipelinesRef.current);
      if (!flight) return;
      const color = SUBSYSTEMS.find((s) => s.id === flight.subsystemId)?.color;
      if (!color) return;
      particleSeq.current += 1;
      const id = `${event.runId}:${event.status}:${particleSeq.current}`;
      const next: RenderedParticle = {
        id,
        from: flight.from,
        to: flight.to,
        color,
        durationS: particleDuration(id),
      };
      setParticles((prev) => appendParticle(prev, next));
    });
  }, []);

  const handleParticleEnd = (id: string) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  };

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
        {/* Spokes: center → each fixed slot. Thin, faint, static. They radiate from
            the cosmic orb behind this SVG (the web's center is concentric with it),
            so no SVG orb is drawn here — the WebGL orb IS the center. */}
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

        {/* Phase 89: one glyph per live particle — each one traces to a real
            RunStatusEvent (dispatch or report), never a timer. Decorative (the
            nodes/orb themselves already carry the interactive/aria surface). */}
        <g aria-hidden="true" data-testid={SubsystemWebTestId.Particles}>
          {particles.map((p) => (
            <ParticleGlyph
              key={p.id}
              onEnd={handleParticleEnd}
              particle={p}
              reducedMotion={reducedMotion}
            />
          ))}
        </g>

        {/* The 8 subsystem nodes — the only interactive layer. `pointer-events-auto`
            re-enables hit-testing through the `pointer-events-none` overlay wrapper
            (so the web never blocks the transcript's scroll, only its own nodes). */}
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
              className="pointer-events-auto cursor-pointer outline-none"
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
