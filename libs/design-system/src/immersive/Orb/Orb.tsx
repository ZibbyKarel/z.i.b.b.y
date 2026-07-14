import { useEffect, useRef } from "react";
import { canMountWebGL } from "../canMountWebGL";
import type { OrbState } from "../orbState";
import { type OrbController, createOrb } from "./createOrb";

export enum OrbTestId {
  Root = "orb-root",
}

export interface OrbMotionOverrides {
  amp?: number;
  speed?: number;
  glow?: number;
  breath?: number;
}

export interface OrbProps {
  /** Target sphere diameter in px. Canvas is `diameter / 0.8` to fit the glow. */
  diameter?: number;
  /** Identity color of the orb body. */
  hex?: string;
  /** Conversational/subsystem state — selects the {@link ORB_MOTION} target. */
  state?: OrbState;
  /** IcosahedronGeometry subdivision — nodes use 1, the core 4. */
  detail?: number;
  antialias?: boolean;
  /** Storybook "vrnění" overrides pushed over the state's motion. */
  motionOverrides?: OrbMotionOverrides;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * A single WebGL wireframe orb (own renderer/scene/camera/rAF). Sizing-API
 * exception: takes a numeric px `diameter` (see immersive bundle docs) because
 * this is continuous canvas geometry. Under jsdom / no-GPU (`canMountWebGL()` is
 * false) it renders only its positioned root div — a quiet no-op.
 */
export function Orb({
  diameter = 72,
  hex = "#5b8def",
  state = "idle",
  detail = 3,
  antialias = false,
  motionOverrides,
  ref,
}: OrbProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<OrbController | null>(null);
  const canvasPx = Math.round(diameter / 0.8);

  useEffect(() => {
    if (!mountRef.current || !canMountWebGL()) return;
    apiRef.current = createOrb(mountRef.current, { hex, state, detail, antialias, motionOverrides });
    return () => {
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // Mount-once; live prop changes flow through the setTarget effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // motionOverrides is in the deps so Storybook knobs stay live after mount;
  // callers should pass a stable/memoized object (or omit it) to avoid
  // re-running on every render.
  useEffect(() => {
    apiRef.current?.setTarget(hex, state, motionOverrides);
  }, [hex, state, motionOverrides]);

  return (
    <div
      data-testid={OrbTestId.Root}
      ref={(node) => {
        mountRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: canvasPx,
        height: canvasPx,
        pointerEvents: "none",
        zIndex: 2,
      }}
    />
  );
}
