import { useEffect, useMemo, useRef } from "react";
import { ensureImmersiveCss } from "../immersive.css";
import { arcPath } from "./arcPath";

export enum HandoffFlareTestId {
  Root = "handoff-flare-root",
  Launch = "handoff-flare-launch",
  Comet = "handoff-flare-comet",
  BurstCore = "handoff-flare-burst-core",
  BurstRing = "handoff-flare-burst-ring",
}

/** Default comet + burst color — the handoff amber from the original prototype. */
const HANDOFF_COLOR = "#ffe066";

/** Default comet flight duration in ms. */
const DEFAULT_DURATION_MS = 1300;

/** Added on top of `durationMs` so the launch/burst tails finish before the instance retires. */
const RETIRE_BUFFER_MS = 200;

export interface HandoffFlareProps {
  /** Source point (source orb centre) the comet launches from. */
  from: { x: number; y: number };
  /** Target point (destination orb centre) the comet arrives at. */
  to: { x: number; y: number };
  /** Comet + burst color. Defaults to the handoff amber (`#ffe066`). */
  color?: string;
  /** Comet flight duration in ms — also scales the burst animations. Defaults to 1300. */
  durationMs?: number;
  /** Called once the instance's lifetime ends (`durationMs + 200ms` after mount). */
  onDone?: () => void;
}

/**
 * A one-shot comet: a launch ring flares at `from`, three trailing comet dots
 * ride a CSS `offset-path` arc from `from` to `to`, and an impact burst (core +
 * ring) flashes at `to`. Self-retires by calling `onDone` once its lifetime
 * ends, so the caller (e.g. a map's handoff-spawn loop) can drop the instance.
 *
 * Ported from `VcHandoffFlare` (`design/Z.I.B.B.Y/zibby/velin-d-map.jsx`).
 */
export function HandoffFlare({
  from,
  to,
  color = HANDOFF_COLOR,
  durationMs = DEFAULT_DURATION_MS,
  onDone,
}: HandoffFlareProps) {
  useEffect(() => {
    ensureImmersiveCss();
  }, []);

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current?.(), durationMs + RETIRE_BUFFER_MS);
    return () => clearTimeout(timer);
  }, [durationMs]);

  const d = useMemo(() => arcPath(from.x, from.y, to.x, to.y), [from.x, from.y, to.x, to.y]);

  const durationS = durationMs / 1000;

  return (
    <span className="contents" data-testid={HandoffFlareTestId.Root}>
      {/* Launch ring — flares out from the source orb. */}
      <span
        data-testid={HandoffFlareTestId.Launch}
        style={{
          position: "absolute",
          left: from.x,
          top: from.y,
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: `1.5px solid ${color}`,
          pointerEvents: "none",
          zIndex: 7,
          animation: "imFlareLaunch .5s ease-out forwards",
        }}
      />
      {/* Comet — a bright core plus two fading echo trails riding the same arc. */}
      {[0, 1, 2].map((i) => (
        <span
          data-testid={`${HandoffFlareTestId.Comet}-${i}`}
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 13 - i * 3,
            height: 13 - i * 3,
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 32%, #fff, ${color} 70%)`,
            boxShadow: `0 0 ${16 - i * 4}px ${4 - i}px ${color}`,
            pointerEvents: "none",
            zIndex: 8 - i,
            offsetPath: `path('${d}')`,
            offsetRotate: "0deg",
            animation: `imFlareFly ${durationS}s cubic-bezier(.3,0,.7,1) ${(i * 0.07).toFixed(2)}s forwards`,
            opacity: 0,
          }}
        />
      ))}
      {/* Impact burst — core flash + expanding ring at the target orb. */}
      <span
        data-testid={HandoffFlareTestId.BurstCore}
        style={{
          position: "absolute",
          left: to.x,
          top: to.y,
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: `radial-gradient(circle, #fff, ${color} 60%, transparent 76%)`,
          pointerEvents: "none",
          zIndex: 8,
          animation: `imFlareBurstCore ${durationS}s ease-out forwards`,
        }}
      />
      <span
        data-testid={HandoffFlareTestId.BurstRing}
        style={{
          position: "absolute",
          left: to.x,
          top: to.y,
          width: 46,
          height: 46,
          borderRadius: "50%",
          border: `1.5px solid ${color}`,
          pointerEvents: "none",
          zIndex: 8,
          animation: `imFlareBurstRing ${durationS}s ease-out forwards`,
        }}
      />
    </span>
  );
}
