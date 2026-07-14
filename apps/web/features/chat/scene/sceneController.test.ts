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
  rendererInstances: [] as Array<{ antialias?: boolean; alpha?: boolean; renderCount: number }>,
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
    // Phase 117c — counts `render()` calls so tests can assert a throttled
    // (117c ~10fps idle, or 117b ~30fps power-saver) cadence actually skips the
    // render body on in-between ticks, not just that a rAF stays scheduled.
    renderCount = 0;
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
    // Phase 117e — the background layer's two-pass render (sky → half-res
    // render target, then an upscale blit → screen) calls this to switch the
    // active framebuffer; a real GL context isn't needed for the controller's
    // own logic under test, so this stays an inert no-op like the rest.
    setRenderTarget() {
      /* noop */
    }
    render() {
      this.renderCount++;
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
  // Phase 117c — clears `scheduled` so a frame the controller pre-schedules
  // and then cancels within the SAME tick (117c's reducedMotion-at-rest park,
  // which schedules for resilience before `tick()` runs and cancels right
  // after if it turns out to be the last one) is correctly reported as
  // unscheduled — matching a real browser's `cancelAnimationFrame`, which the
  // controller only ever calls for the one id it just requested.
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
    scheduled = null;
  });
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

/** The scene's default roster — every registry subsystem present and `idle`,
 * matching the mini-orbs' construction-time state (so pushing this list is a
 * no-op that must NOT wake a parked scene). Pass a per-id state override to
 * simulate a genuine status change (e.g. a subsystem going `running`). */
function rosterAllIdle(overrides: Record<string, SceneSubsystem["state"]> = {}): SceneSubsystem[] {
  return SUBSYSTEMS.map((s) => ({
    id: s.id,
    color: s.color,
    state: overrides[s.id] ?? "idle",
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

    // A subsystem goes `running` — a genuine status change that must ease
    // in on its own, so it re-arms the frozen loop.
    const first = SUBSYSTEMS[0]!;
    controller.setSubsystems(rosterAllIdle({ [first.id]: "running" }));
    expect(loop.isScheduled()).toBe(true);
    controller.dispose();
  });

  it("does NOT re-arm a parked powerSaver loop on a no-op setSubsystems refresh", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(container, baseInputs({ powerSaver: true }));
    loop.step(40);
    expect(loop.isScheduled()).toBe(false);

    // Same values as the mini-orbs were built with (all `idle`), just a fresh
    // array — a periodic feed refetch must not defeat the freeze.
    controller.setSubsystems(rosterAllIdle());
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
    controller.setSubsystems(rosterAllIdle({ [first.id]: "running" }));
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

describe("createSceneController — phase 117c idle demand-render (always-on, non-powerSaver)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    rendererInstances.length = 0;
  });

  it("parks the loop once at rest when reducedMotion is on — no drift left to animate", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(
      container,
      baseInputs({ powerSaver: false, reducedMotion: true }),
    );
    expect(loop.isScheduled()).toBe(true);

    // reducedMotion:true skips the mitosis intro entirely (the scene is built
    // straight into its rest state), so the very first full-rate tick already
    // finds nothing left to animate (energy/flash start at 0, no particle in
    // flight) and parks — same "zero draws while resting" outcome as
    // powerSaver's variant-5 freeze, reached via a different gate.
    loop.step(16);
    expect(loop.isScheduled()).toBe(false);
    controller.dispose();
  });

  it("re-arms a reducedMotion-parked non-powerSaver loop on pushActivity", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(
      container,
      baseInputs({ powerSaver: false, reducedMotion: true }),
    );
    loop.step(16);
    expect(loop.isScheduled()).toBe(false);

    controller.pushActivity(10);
    expect(loop.isScheduled()).toBe(true);
    controller.dispose();
  });

  it("re-arms a reducedMotion-parked non-powerSaver loop on a mode change via setInputs", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(
      container,
      baseInputs({ powerSaver: false, reducedMotion: true }),
    );
    loop.step(16);
    expect(loop.isScheduled()).toBe(false);

    controller.setInputs(baseInputs({ powerSaver: false, reducedMotion: true, mode: "listening" }));
    expect(loop.isScheduled()).toBe(true);
    controller.dispose();
  });

  it("does NOT park a resting scene with the camera drift still active (reducedMotion off) — throttles to ~10fps instead", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(
      container,
      baseInputs({ powerSaver: false, reducedMotion: false }),
    );
    const orb = rendererInstances[1]!;

    // Drive well past the one-shot mitosis entry (MITOSIS_TOTAL_DURATION = 1.5s)
    // at full rate so the scene actually reaches rest — every tick in this
    // warm-up renders (full rate, entry still in flight), so just track the
    // render count from here rather than asserting on it. (Some of the tail of
    // this warm-up may already land in the throttled 10fps branch once rest is
    // reached mid-loop, leaving an unknown residual wall-clock accumulator —
    // deliberately not assumed below.)
    for (let i = 0; i < 40; i++) loop.step(50); // 2s of 50ms full-rate ticks
    expect(loop.isScheduled()).toBe(true); // never parks — the drift keeps it alive

    // Sample small (25ms) real-rAF-sized ticks across a window comfortably
    // longer than the ~100ms/10fps interval. Regardless of exactly where the
    // accumulator happened to land, this window must show BOTH at least one
    // tick that renders nothing new (proof the render body is throttled, not
    // run every rAF) AND at least one tick that does render (proof it's a
    // cadence cap, not a hard freeze) — while the loop never stops scheduling.
    let sawSkippedTick = false;
    let sawRenderedTick = false;
    let lastCount = orb.renderCount;
    for (let i = 0; i < 12; i++) {
      loop.step(25);
      expect(loop.isScheduled()).toBe(true);
      if (orb.renderCount === lastCount) sawSkippedTick = true;
      else sawRenderedTick = true;
      lastCount = orb.renderCount;
    }
    expect(sawSkippedTick).toBe(true);
    expect(sawRenderedTick).toBe(true);
    controller.dispose();
  });

  it("restores full rate immediately once activity arrives during the resting ~10fps cadence", () => {
    const loop = mockFrameLoop();
    const container = document.createElement("div");
    const controller = createSceneController(
      container,
      baseInputs({ powerSaver: false, reducedMotion: false }),
    );
    const orb = rendererInstances[1]!;
    for (let i = 0; i < 40; i++) loop.step(50); // settle past the mitosis entry into rest
    loop.step(20); // partway into a throttled 10fps step — no render yet
    const restingRenderCount = orb.renderCount;

    controller.pushActivity(10);
    // The next real animation frame (a typical ~16ms tick, well under the
    // resting 100ms interval) already renders — activity flips `atRest` before
    // `frame()` re-evaluates its throttle, so the scene doesn't wait out the
    // rest of the 10fps interval it was mid-accumulating.
    loop.step(16);
    expect(orb.renderCount).toBe(restingRenderCount + 1);
    expect(loop.isScheduled()).toBe(true);
    controller.dispose();
  });
});
