import { useEffect, useMemo, useRef } from "react";
import { seededRandom } from "../seededRandom";

export enum OrbitFieldTestId {
  Root = "orbit-field-root",
  Dot = "orbit-field-dot",
}

export interface OrbitFieldProps {
  /** Seeds the deterministic layout — same seed always yields the same orbits. */
  seed: string;
  /** Dot color (also drives the glow / gradient edge). */
  color: string;
  /** Number of orbiting dots to render. */
  count: number;
  /** Base orbit radius in px; each dot's orbit grows by `i * 10 + rand() * 5` on top of this. */
  baseRadius: number;
}

interface Orbiter {
  /** Orbit radius. */
  R: number;
  /** Orbit plane inclination (rad). */
  inc: number;
  /** Orbit plane roll/rotation (rad). */
  rot: number;
  /** Angular speed (signed — direction is randomized). */
  speed: number;
  /** Starting angle (rad). */
  phase: number;
  /** Dot diameter in px. */
  size: number;
}

/** Builds the orbiter descriptors deterministically from `seed`. */
function buildOrbiters(seed: string, count: number, baseRadius: number): Orbiter[] {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => ({
    R: baseRadius + i * 10 + rand() * 5,
    inc: 0.5 + rand() * 0.7,
    rot: rand() * Math.PI * 2,
    speed: (0.5 + rand() * 0.5) * (rand() > 0.5 ? 1 : -1),
    phase: rand() * Math.PI * 2,
    size: 5 + rand() * 2.5,
  }));
}

/**
 * Faux-3D orbiting task dots — each dot is one active task on an inclined orbit
 * around the host (an `Orb`, a subsystem node, …). A seeded PRNG lays out the
 * orbiters deterministically (stable across renders for the same `seed`); a
 * `requestAnimationFrame` loop projects them to 2D each frame, mutating each
 * dot's `transform` / `opacity` / `filter` / `zIndex` in place (no per-frame
 * allocation). Depth (`z`) drives scale, opacity, blur, and stacking so far
 * dots recede and near dots pop forward.
 *
 * Under `prefers-reduced-motion: reduce`, the field freezes at `t = 0` and no
 * `requestAnimationFrame` is scheduled.
 *
 * Ported verbatim (math + visual) from `VcOrbitField` in the original orb map
 * prototype.
 */
export function OrbitField({ seed, color, count, baseRadius }: OrbitFieldProps) {
  const orbiters = useMemo(
    () => buildOrbiters(seed, count, baseRadius),
    [seed, count, baseRadius],
  );

  const dots = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (orbiters.length === 0) return;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf: number | undefined;
    const t0 = performance.now();

    const frame = (now: number) => {
      const t = reduce ? 0 : (now - t0) / 1000;
      for (let i = 0; i < orbiters.length; i++) {
        const o = orbiters[i];
        const el = dots.current[i];
        if (!o || !el) continue;

        const th = o.phase + t * o.speed * 1.5;
        const lx = o.R * Math.cos(th);
        const ly = o.R * Math.sin(th);
        const x = lx;
        const y = ly * Math.cos(o.inc);
        const z = ly * Math.sin(o.inc);
        const cr = Math.cos(o.rot);
        const sr = Math.sin(o.rot);
        const X = x * cr - y * sr;
        const Y = x * sr + y * cr;
        const depth = (z / o.R + 1) / 2;
        const sc = 0.5 + depth * 0.95;

        el.style.transform = `translate(-50%,-50%) translate(${X.toFixed(2)}px, ${Y.toFixed(2)}px) scale(${sc.toFixed(3)})`;
        el.style.opacity = (0.3 + depth * 0.7).toFixed(3);
        el.style.filter = `blur(${((1 - depth) * 1.4).toFixed(2)}px)`;
        el.style.zIndex = z > 0 ? "4" : "1";
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    frame(t0);
    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
    };
  }, [orbiters]);

  return (
    <span className="contents" data-testid={OrbitFieldTestId.Root}>
      {orbiters.map((o, i) => (
        <span
          data-testid={OrbitFieldTestId.Dot}
          key={i}
          ref={(el) => {
            dots.current[i] = el;
          }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: o.size,
            height: o.size,
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 32%, #ffffff, ${color} 78%)`,
            boxShadow: `0 0 8px 1.5px ${color}, 0 0 3px #fff`,
            pointerEvents: "none",
            willChange: "transform, opacity",
          }}
        />
      ))}
    </span>
  );
}
