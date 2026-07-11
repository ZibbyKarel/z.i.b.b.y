import { SUBSYSTEMS } from "@zibby/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SceneInputs, SceneSubsystem } from "./sceneTypes";

/**
 * Phase 117b — `sceneController.ts` drives real `THREE.WebGLRenderer`s, which
 * jsdom can't construct (no real WebGL context — see `canMountWebGL.ts`, which
 * is why `CosmicScene` never instantiates the controller in component tests).
 * Everything else three.js does here (`Scene`, `Group`, `Vector3`, `Clock`,
 * materials, geometries, `Points`/`LineSegments`) is pure JS and needs no GPU —
 * so mocking ONLY `WebGLRenderer` lets the controller run headlessly: renderer
 * construction is recorded (so the antialias flag is assertable) and
 * `render`/`dispose`/etc. are inert no-ops.
 */
const { rendererInstances } = vi.hoisted(() => ({
  rendererInstances: [] as Array<{ antialias?: boolean; alpha?: boolean }>,
}));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    toneMapping = 0;
    toneMappingExposure = 1;
    outputColorSpace = "";
    autoClear = true;
    antialias?: boolean;
    alpha?: boolean;
    constructor(options: { alpha?: boolean; antialias?: boolean } = {}) {
      this.antialias = options.antialias;
      this.alpha = options.alpha;
      this.domElement = document.createElement("canvas");
      rendererInstances.push(this);
    }
    setPixelRatio() {
      /* noop */
    }
    setSize() {
      /* noop */
    }
    setClearColor() {
      /* noop */
    }
    clear() {
      /* noop */
    }
    render() {
      /* noop */
    }
    dispose() {
      /* noop */
    }
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});

// Imported AFTER the mock is registered above (vi.mock is hoisted regardless,
// but keeping the import below the mock keeps the file's read order sane).
import { createSceneController } from "./sceneController";

/**
 * Drives the controller's `requestAnimationFrame`-based loop deterministically:
 * captures the latest scheduled callback (if any) and lets the test advance
 * wall-clock time and fire it by hand — mirrors the harness in
 * `ApprovalCard.test.tsx` (mocking `performance.now()` so `THREE.Clock`'s
 * `getDelta()` produces an exact, test-controlled `dt`).
 */
function mockFrameLoop() {
  let scheduled: FrameRequestCallback | null = null;
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    scheduled = cb;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  return {
    /** Whether a frame is currently scheduled — i.e. the loop is still going. */
    isScheduled: () => scheduled !== null,
    /** Advance wall-clock time by `dtMs` and fire the scheduled callback (if any),
     * consuming it — a subsequent `isScheduled()` reflects whether THIS
     * invocation rescheduled another one. */
    step(dtMs: number) {
      now += dtMs;
      const cb = scheduled;
      scheduled = null;
      cb?.(now);
    },
  };
}

function baseInputs(overrides: Partial<SceneInputs> = {}): SceneInputs {
  return { mode: "idle", dock: [], reducedMotion: true, powerSaver: false, ...overrides };
}

/** The scene's default roster — every registry subsystem present and `klid`,
 * matching the mini-orbs' construction-time state (so pushing this list is a
 * no-op that must NOT wake a parked scene). Pass a per-id state override to
 * simulate a genuine status change (e.g. a subsystem going `bezi`). */
function rosterAllKlid(overrides: Record<string, SceneSubsystem["state"]> = {}): SceneSubsystem[] {
  return SUBSYSTEMS.map((s) => ({
    id: s.id,
    color: s.color,
    state: overrides[s.id] ?? "klid",
    present: true,
  }));
}

describe("createSceneController — phase 117b power-saver", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    rendererInstances.length = 0;
  });

  it("requests antialias:false for the orb renderer under powerSaver (variant 4a)", () => {
    mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: true }));
    // [0] is the background renderer (always antialias:false); [1] is the orb
    // renderer, whose antialias flag is what phase 117b makes conditional.
    expect(rendererInstances).toHaveLength(2);
    expect(rendererInstances[1]?.antialias).toBe(false);
    controller.dispose();
  });

  it("keeps antialias:true for the orb renderer by default — non-powerSaver unchanged", () => {
    mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: false }));
    expect(rendererInstances[1]?.antialias).toBe(true);
    controller.dispose();
  });

  it("never parks the loop outside powerSaver, even fully at rest (regression guard)", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: false }));
    expect(loop.isScheduled()).toBe(true);
    for (let i = 0; i < 5; i++) {
      loop.step(16);
      expect(loop.isScheduled()).toBe(true);
    }
    controller.dispose();
  });

  it("parks the loop once at rest under powerSaver (variant 5) — zero frames scheduled", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: true }));
    expect(loop.isScheduled()).toBe(true);

    // reducedMotion:true (from baseInputs) skips the mitosis intro entirely, so
    // the very first tick past the ~30fps interval already finds the scene at
    // rest (energy/flash start at 0, no particle emitted) and parks.
    loop.step(40); // > 1000/30 ms — the throttle lets this tick execute.
    expect(loop.isScheduled()).toBe(false);
    controller.dispose();
  });

  it("re-arms a parked powerSaver loop on pushActivity", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: true }));
    loop.step(40);
    expect(loop.isScheduled()).toBe(false);

    controller.pushActivity(10);
    expect(loop.isScheduled()).toBe(true);
    controller.dispose();
  });

  it("re-arms a parked powerSaver loop on flashComplete", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: true }));
    loop.step(40);
    expect(loop.isScheduled()).toBe(false);

    controller.flashComplete();
    expect(loop.isScheduled()).toBe(true);
    controller.dispose();
  });

  it("re-arms a parked powerSaver loop on a mode change via setInputs", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: true }));
    loop.step(40);
    expect(loop.isScheduled()).toBe(false);

    controller.setInputs(baseInputs({ powerSaver: true, mode: "listening" }));
    expect(loop.isScheduled()).toBe(true);
    controller.dispose();
  });

  it("re-arms a parked powerSaver loop when a subsystem's state changes via setSubsystems", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: true }));
    loop.step(40);
    expect(loop.isScheduled()).toBe(false);

    // A subsystem goes `bezi` (running) — a genuine status change that must ease
    // in on its own, so it re-arms the frozen loop.
    const first = SUBSYSTEMS[0]!;
    controller.setSubsystems(rosterAllKlid({ [first.id]: "bezi" }));
    expect(loop.isScheduled()).toBe(true);
    controller.dispose();
  });

  it("does NOT re-arm a parked powerSaver loop on a no-op setSubsystems refresh", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: true }));
    loop.step(40);
    expect(loop.isScheduled()).toBe(false);

    // Same values as the mini-orbs were built with (all `klid`), just a fresh
    // array — a periodic feed refetch must not defeat the freeze.
    controller.setSubsystems(rosterAllKlid());
    expect(loop.isScheduled()).toBe(false);
    controller.dispose();
  });

  it("keeps a subsystem-change wake alive past a single tick so the ease can settle", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: true }));
    loop.step(40);
    expect(loop.isScheduled()).toBe(false);

    const first = SUBSYSTEMS[0]!;
    controller.setSubsystems(rosterAllKlid({ [first.id]: "bezi" }));
    // A few ~30fps ticks in (well under the ~1s settle window) the loop is still
    // running — it did NOT park after the first tick (which would freeze the
    // mini-orb partway to its new colour).
    for (let i = 0; i < 5; i++) {
      loop.step(40);
      expect(loop.isScheduled()).toBe(true);
    }
    controller.dispose();
  });

  it("does NOT re-arm a parked powerSaver loop while the host has paused it (hidden tab)", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: true }));
    loop.step(40);
    expect(loop.isScheduled()).toBe(false);

    controller.pause();
    controller.pushActivity(10);
    expect(loop.isScheduled()).toBe(false); // activity while hidden must not draw

    controller.resume();
    expect(loop.isScheduled()).toBe(true); // resuming is allowed to draw one frame
    controller.dispose();
  });
});
