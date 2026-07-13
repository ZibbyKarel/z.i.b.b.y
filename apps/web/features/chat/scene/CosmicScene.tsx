/* eslint-disable react/forbid-dom-props -- The scene root is a bespoke full-screen
   WebGL host: three.js appends its own <canvas> layers into this container and the
   DOM label/dock overlays are absolutely positioned to track projected world
   positions — genuinely dynamic geometry with no DS-prop equivalent, so this uses
   the sanctioned style escape hatch, file-level. */
"use client";

import { SUBSYSTEMS, type SubsystemId, type SubsystemWithStatus } from "@zibby/contracts";
import { useEffect, useRef, useState } from "react";
import type { Pipeline } from "../../../domain";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import type { RunView } from "../../runs/run";
import { onRunEvent } from "../../runs/runEvents";
import { useSystemConfigQuery } from "../../system";
import { flightForEvent } from "../../subsystems/components/SubsystemWeb/particle-mapping";
import { SubsystemOrbsOverlay } from "./SubsystemOrbsOverlay";
import { canMountWebGL } from "./canMountWebGL";
import type { SceneController } from "./sceneController";
import type { SceneDockItem, SceneMode, SceneSubsystem } from "./sceneTypes";
import { activeRunsBySubsystem } from "./subsystemLoad";

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
  /** Task C1 — activating the central orb's hit-target (click / keyboard), opening
   * `CoreOverviewDialog` upstream. Threaded straight through to
   * {@link SubsystemOrbsOverlay}, which owns the interactive DOM layer. */
  onOpenCore?: () => void;
  /** Phase 97: the pipeline catalog — `flightForEvent`'s owner resolution
   * (`runId` → owning pipeline → `ownerSubsystem`) reads this. Already fetched by
   * `ChatScreen` for other purposes; read via a ref (see the mount effect below) so
   * a refetch never resubscribes the `onRunEvent` listener. */
  pipelines?: Pipeline[];
  /** Phase 97: the live runs feed — same `flightForEvent` resolution. */
  runs?: RunView[];
}

const EMPTY_SUBSYSTEMS: SubsystemWithStatus[] = [];
const EMPTY_PIPELINES: Pipeline[] = [];
const EMPTY_RUNS: RunView[] = [];

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
 *
 * Phase 117b — reads the operator's persisted `powerSaver` toggle and keys the
 * inner view by it: `antialias` is fixed at `WebGLRenderer` construction and can't
 * be changed live, so flipping the toggle fully remounts the scene (rare, explicit
 * user action — the remount cost is acceptable and avoids renderer dispose/recreate
 * plumbing).
 */
export function CosmicScene(props: CosmicSceneProps) {
  const { data: systemConfig } = useSystemConfigQuery();
  const powerSaver = systemConfig?.powerSaver ?? false;
  return <CosmicSceneView key={`scene-${powerSaver}`} powerSaver={powerSaver} {...props} />;
}

interface CosmicSceneViewProps extends CosmicSceneProps {
  powerSaver: boolean;
}

function CosmicSceneView({
  mode = "idle",
  dock = EMPTY_DOCK,
  streamChars = 0,
  completedTick = 0,
  subsystems = EMPTY_SUBSYSTEMS,
  selectedSubsystemId = null,
  onSelectSubsystem = noop,
  onOpenCore,
  pipelines = EMPTY_PIPELINES,
  runs = EMPTY_RUNS,
  powerSaver,
}: CosmicSceneViewProps) {
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
  //
  // Phase 117d — the render loop is gated by THREE independent "should this be
  // running" reasons: the tab being hidden, the window losing OS focus, and the
  // scene container scrolling out of the viewport. Each is tracked as its own
  // blocking boolean; they collapse into a single derived `shouldRun` that is
  // only re-applied to the controller on an actual transition (`lastAppliedRef`
  // guards this). This is what makes it safe to have three uncoordinated event
  // sources: `resume()` clears the controller's own `hostPaused` flag and
  // restarts the loop, so calling it while a *second* reason is still active
  // would wrongly un-pause the scene out from under that reason. Only the
  // transition from "some reason blocked" to "all clear" may call `resume()`.
  useEffect(() => {
    if (!canMountWebGL() || !containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;

    // Seed from the real environment at mount time — the scene can mount into
    // an already-hidden tab, an already-unfocused window (`document.hasFocus()`
    // is the only reliable read for this — there's no "initial focus" event),
    // or (in principle) already off-screen. `offScreen` starts `false` since
    // the `IntersectionObserver` below reports the true state on its first
    // callback almost immediately; defaulting to "on screen" just means at
    // most one avoidable frame if it's wrong.
    const reasons = {
      documentHidden: document.visibilityState === "hidden",
      windowBlurred: typeof document.hasFocus === "function" ? !document.hasFocus() : false,
      offScreen: false,
    };
    const lastAppliedRunningRef = {
      current: !reasons.documentHidden && !reasons.windowBlurred && !reasons.offScreen,
    };

    // Re-derive "should the loop run" from the three reasons and, on an actual
    // transition, apply it. Idempotent by construction — repeated calls with no
    // change to `reasons` are no-ops.
    const applyRunState = () => {
      const shouldRun = !reasons.documentHidden && !reasons.windowBlurred && !reasons.offScreen;
      if (shouldRun === lastAppliedRunningRef.current) return;
      lastAppliedRunningRef.current = shouldRun;
      if (shouldRun) controllerRef.current?.resume();
      else controllerRef.current?.pause();
    };

    void import("./sceneController").then(({ createSceneController }) => {
      if (cancelled || !containerRef.current) return;
      const created = createSceneController(container, {
        mode,
        dock,
        reducedMotion,
        powerSaver,
      });
      controllerRef.current = created;
      setController(created);
      // The controller starts its loop running unconditionally on construction
      // (it has no way to know about blur/visibility/viewport at birth) — sync
      // it to whatever was already true (e.g. mounted into a blurred window)
      // before anything else can observe a frame.
      if (!lastAppliedRunningRef.current) created.pause();
      // Push the initial subsystem roster (the effect below only fires on CHANGE).
      created.setSubsystems(toSceneSubsystems(subsystems));
      // Expose the key setters for console testing during development — drive the
      // orb/dispatch by hand without a live turn (e.g. `__cosmicScene.triggerDispatch("koder")`).
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __cosmicScene?: SceneController }).__cosmicScene = created;
      }
    });

    const onVisibility = () => {
      reasons.documentHidden = document.visibilityState === "hidden";
      applyRunState();
    };
    const onBlur = () => {
      reasons.windowBlurred = true;
      applyRunState();
    };
    const onFocus = () => {
      reasons.windowBlurred = false;
      applyRunState();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    // Feature-detect: jsdom/older browsers may lack `IntersectionObserver` —
    // treat "no observer available" as never off-screen rather than blocking
    // the loop forever.
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          reasons.offScreen = entry ? !entry.isIntersecting : false;
          applyRunState();
        },
        { threshold: 0 },
      );
      observer.observe(container);
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      observer?.disconnect();
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

  // Push derived chat state whenever it changes. `powerSaver` itself only takes
  // effect via the remount above (antialias can't change live) but is included
  // here too so a mid-session config refetch (unlikely — the key remount already
  // covers the real toggle path) never leaves the controller's cached inputs stale.
  useEffect(() => {
    controllerRef.current?.setInputs({ mode, dock, reducedMotion, powerSaver });
  }, [mode, dock, reducedMotion, powerSaver]);

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

  // Phase 97 — the restored handoff particles: read `runs`/`pipelines` through refs
  // (copying the retired SubsystemWeb's own pattern) so a query refetch's fresh
  // array reference never tears down and resubscribes the listener — the shared
  // `RunEventsProvider`'s ONE EventSource keeps delivering events the whole time
  // regardless.
  const runsRef = useRef(runs);
  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);
  const pipelinesRef = useRef(pipelines);
  useEffect(() => {
    pipelinesRef.current = pipelines;
  }, [pipelines]);

  // Task B4 — the per-subsystem orbital task particles ("each light = one
  // processing task"): recompute the active-run tally whenever `runs` OR
  // `pipelines` changes and push it to the controller. `pipelines` is in the dep
  // array (not just read via `pipelinesRef`) so a tally computed before the
  // pipeline catalog resolves (runs arriving first → owner lookups miss →
  // `{}`) recomputes once the catalog lands, instead of going stale until the
  // next `runs` change; `pipelinesRef.current` is still read inside so this
  // effect doesn't ALSO need to resubscribe `onRunEvent` below (that listener's
  // own ref pattern is unrelated and untouched). `pipelines` is a query-result
  // array that only changes when the catalog itself changes, and the
  // controller's own `lastAppliedLoad` guard makes a recompute idempotent, so
  // this doesn't cause excessive re-runs.
  useEffect(() => {
    controller?.setSubsystemLoad(activeRunsBySubsystem(runsRef.current, pipelinesRef.current));
  }, [controller, runs, pipelines]);

  useEffect(() => {
    return onRunEvent((event) => {
      const flight = flightForEvent(event, runsRef.current, pipelinesRef.current);
      if (!flight) return;
      const color = SUBSYSTEMS.find((s) => s.id === flight.subsystemId)?.color;
      if (!color) return;
      controllerRef.current?.emitFlight(flight.from, flight.to, color);
    });
    // Subscribe once — `runsRef`/`pipelinesRef` above keep the closure's data fresh
    // without ever needing to unsubscribe/resubscribe.
  }, []);

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
        onOpenCore={onOpenCore}
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
