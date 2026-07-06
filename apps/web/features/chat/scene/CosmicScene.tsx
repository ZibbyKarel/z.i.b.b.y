/* eslint-disable react/forbid-dom-props -- The scene root is a bespoke full-screen
   WebGL host: three.js appends its own <canvas> layers into this container and the
   DOM label/dock overlays are absolutely positioned to track projected world
   positions — genuinely dynamic geometry with no DS-prop equivalent, so this uses
   the sanctioned style escape hatch, file-level. */
"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { canMountWebGL } from "./canMountWebGL";
import type { SceneController } from "./sceneController";
import type { SceneAgent, SceneDockItem, SceneMode } from "./sceneTypes";

export enum CosmicSceneTestId {
  /** The scene root — carries `data-mode` so the derivation tests (and console
   * debugging) can read the current conversational state without WebGL. */
  Root = "cosmic-scene",
}

export interface CosmicSceneProps {
  /** The derived conversational state — drives every orb/constellation reaction. */
  mode?: SceneMode;
  /** The constellation roster (Tier 4). */
  agents?: SceneAgent[];
  /** Running/queued agents & pipelines shown in the dock (Tier 5). */
  dock?: SceneDockItem[];
  /** Cumulative character count of the in-flight streamed turn. The scene diffs it
   * across renders and feeds each increment to the energy signal (Tier 3) — a
   * declarative substitute for pushing a callback on every token. */
  streamChars?: number;
  /** A monotonically increasing counter bumped once per completed (`done`) turn.
   * The scene fires the brief ok-green completion flash on each increment. */
  completedTick?: number;
  /** The most recent agent dispatch (a `tool` event named an agent). The scene
   * fires the beam/flare/ring reaction whenever `seq` increases. */
  dispatch?: { seq: number; agentId: string };
}

/**
 * The full-screen living cosmic interface behind ZIBBY's chat: a text-reactive orb
 * in a procedural deep-space nebula, ringed by a constellation of sub-agents. A thin
 * React shell over the vanilla-three {@link SceneController} — it owns no visual
 * state, only the controller's lifecycle and the flow of derived chat state into it.
 *
 * The controller is created once (browser + WebGL only) and disposed on unmount;
 * jsdom and GPU-less environments skip it entirely and this renders just its root
 * `div`, so component tests stay WebGL-free while still asserting the `data-mode`
 * contract.
 */
export function CosmicScene({
  mode = "idle",
  agents = EMPTY_AGENTS,
  dock = EMPTY_DOCK,
  streamChars = 0,
  completedTick = 0,
  dispatch,
}: CosmicSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SceneController | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const prevChars = useRef(0);
  const prevTick = useRef(0);
  const prevDispatchSeq = useRef(0);

  // Instantiate the controller once. Dynamically imported so three.js never loads
  // in SSR or the initial HUD bundle, and never instantiates in jsdom/no-WebGL.
  useEffect(() => {
    if (!canMountWebGL() || !containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;

    void import("./sceneController").then(({ createSceneController }) => {
      if (cancelled || !containerRef.current) return;
      const controller = createSceneController(container, { mode, agents, dock, reducedMotion });
      controllerRef.current = controller;
      // Expose the key setters for console testing during development — drive the
      // orb/dispatch by hand without a live turn (e.g. `__cosmicScene.triggerDispatch("koder")`).
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __cosmicScene?: SceneController }).__cosmicScene = controller;
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
    controllerRef.current?.setInputs({ mode, agents, dock, reducedMotion });
  }, [mode, agents, dock, reducedMotion]);

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

  // Fire the dispatch reaction whenever a new agent dispatch lands.
  useEffect(() => {
    if (dispatch && dispatch.seq > prevDispatchSeq.current) {
      controllerRef.current?.triggerDispatch(dispatch.agentId);
    }
    if (dispatch) prevDispatchSeq.current = dispatch.seq;
  }, [dispatch]);

  return (
    <div
      aria-hidden="true"
      data-mode={mode}
      data-testid={CosmicSceneTestId.Root}
      ref={containerRef}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    />
  );
}

const EMPTY_AGENTS: SceneAgent[] = [];
const EMPTY_DOCK: SceneDockItem[] = [];
