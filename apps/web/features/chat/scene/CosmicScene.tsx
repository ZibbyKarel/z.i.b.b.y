/* eslint-disable react/forbid-dom-props -- The scene root is a bespoke full-screen
   WebGL host: three.js appends its own <canvas> layers into this container and the
   DOM label/dock overlays are absolutely positioned to track projected world
   positions — genuinely dynamic geometry with no DS-prop equivalent, so this uses
   the sanctioned style escape hatch, file-level. */
"use client";

import type { SubsystemId, SubsystemWithStatus } from "@zibby/contracts";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { SubsystemOrbsOverlay } from "./SubsystemOrbsOverlay";
import { canMountWebGL } from "./canMountWebGL";
import type { SceneController } from "./sceneController";
import type { SceneDockItem, SceneMode, SceneSubsystem } from "./sceneTypes";

export enum CosmicSceneTestId {
  /** The scene root — carries `data-mode` so the derivation tests (and console
   * debugging) can read the current conversational state without WebGL. */
  Root = "cosmic-scene",
}

export interface CosmicSceneProps {
  /** The derived conversational state — drives every orb reaction. */
  mode?: SceneMode;
  /** Running/queued agents & pipelines shown in the dock (Tier 5). */
  dock?: SceneDockItem[];
  /** Cumulative character count of the in-flight streamed turn. The scene diffs it
   * across renders and feeds each increment to the energy signal (Tier 3) — a
   * declarative substitute for pushing a callback on every token. */
  streamChars?: number;
  /** A monotonically increasing counter bumped once per completed (`done`) turn.
   * The scene fires the brief ok-green completion flash on each increment. */
  completedTick?: number;
  /** The 8 named subsystems + live status (phase 95) — drives the WebGL mini-orbs
   * and the interactive {@link SubsystemOrbsOverlay} rendered inside this scene. */
  subsystems?: SubsystemWithStatus[];
  /** The currently-selected subsystem, if any (selection ring + `aria-pressed`). */
  selectedSubsystemId?: SubsystemId | null;
  /** Selecting a mini-orb (click / keyboard) — opens the subsystem drawer upstream. */
  onSelectSubsystem?: (id: SubsystemId) => void;
}

const EMPTY_SUBSYSTEMS: SubsystemWithStatus[] = [];

/** Map the contract status shape to the leaner {@link SceneSubsystem} the controller
 * drives its mini-orbs from — everything in the feed is present. */
function toSceneSubsystems(subsystems: SubsystemWithStatus[]): SceneSubsystem[] {
  return subsystems.map((s) => ({ id: s.id, color: s.color, state: s.state, present: true }));
}

/**
 * The full-screen living cosmic interface behind ZIBBY's chat: a text-reactive orb
 * (rendered at half scale so the subsystem web can ring it) in a procedural
 * deep-space nebula. A thin React shell over the vanilla-three {@link SceneController}
 * — it owns no visual state, only the controller's lifecycle and the flow of derived
 * chat state into it.
 *
 * The controller is created once (browser + WebGL only) and disposed on unmount;
 * jsdom and GPU-less environments skip it entirely and this renders just its root
 * `div`, so component tests stay WebGL-free while still asserting the `data-mode`
 * contract.
 */
export function CosmicScene({
  mode = "idle",
  dock = EMPTY_DOCK,
  streamChars = 0,
  completedTick = 0,
  subsystems = EMPTY_SUBSYSTEMS,
  selectedSubsystemId = null,
  onSelectSubsystem = noop,
}: CosmicSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SceneController | null>(null);
  // Controller as state (not just a ref) so the overlay re-subscribes to
  // projections once the async-imported controller is ready — a ref change alone
  // wouldn't re-run the overlay's subscription effect.
  const [controller, setController] = useState<SceneController | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const prevChars = useRef(0);
  const prevTick = useRef(0);

  // Instantiate the controller once. Dynamically imported so three.js never loads
  // in SSR or the initial HUD bundle, and never instantiates in jsdom/no-WebGL.
  useEffect(() => {
    if (!canMountWebGL() || !containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;

    void import("./sceneController").then(({ createSceneController }) => {
      if (cancelled || !containerRef.current) return;
      const created = createSceneController(container, { mode, dock, reducedMotion });
      controllerRef.current = created;
      setController(created);
      // Push the initial subsystem roster (the effect below only fires on CHANGE).
      created.setSubsystems(toSceneSubsystems(subsystems));
      // Expose the key setters for console testing during development — drive the
      // orb/dispatch by hand without a live turn (e.g. `__cosmicScene.triggerDispatch("koder")`).
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __cosmicScene?: SceneController }).__cosmicScene = created;
      }
    });

    const onVisibility = () => {
      if (document.hidden) controllerRef.current?.pause();
      else controllerRef.current?.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setController(null);
      if (process.env.NODE_ENV !== "production") {
        delete (window as unknown as { __cosmicScene?: SceneController }).__cosmicScene;
      }
    };
    // Mount-once: subsequent prop changes flow through the effects below, never a
    // re-instantiation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push derived chat state whenever it changes.
  useEffect(() => {
    controllerRef.current?.setInputs({ mode, dock, reducedMotion });
  }, [mode, dock, reducedMotion]);

  // Feed each stream increment into the energy signal (Tier 3).
  useEffect(() => {
    const delta = streamChars - prevChars.current;
    prevChars.current = streamChars;
    // A fresh turn resets the counter to 0 (delta goes negative) — ignore that.
    if (delta > 0) controllerRef.current?.pushActivity(delta);
  }, [streamChars]);

  // Fire the completion flash once per finished turn.
  useEffect(() => {
    if (completedTick > prevTick.current) controllerRef.current?.flashComplete();
    prevTick.current = completedTick;
  }, [completedTick]);

  // Push the subsystem roster whenever it changes (phase 95). Depends on `controller`
  // so it also fires the moment the async-imported controller becomes ready (the
  // mount effect pushed the initial roster; this keeps it in sync thereafter).
  useEffect(() => {
    controller?.setSubsystems(toSceneSubsystems(subsystems));
  }, [controller, subsystems]);

  return (
    <>
      {/* The WebGL host: three.js appends its <canvas> layers here. Non-interactive
          and hidden from a11y — the interactive/accessible surface is the sibling
          overlay below. */}
      <div
        aria-hidden="true"
        data-mode={mode}
        data-testid={CosmicSceneTestId.Root}
        ref={containerRef}
        style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
      />
      {/* The interactive DOM layer for the mini-orbs — same-sized sibling so its
          projected (container-px) coordinates line up. Renders all its nodes even
          without a controller (jsdom), so component tests stay WebGL-free. */}
      <SubsystemOrbsOverlay
        onSelect={onSelectSubsystem}
        reducedMotion={reducedMotion}
        selectedId={selectedSubsystemId}
        subscribe={controller?.subscribeProjections}
        subsystems={subsystems}
      />
    </>
  );
}

const EMPTY_DOCK: SceneDockItem[] = [];

function noop() {
  // Default `onSelectSubsystem` — the scene is decorative until a caller wires
  // selection (ChatScreen does; the Storybook stories don't need it).
}
