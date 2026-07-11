import { type SystemConfig, SystemConfigSchema } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders as render, waitFor } from "../../../test/render";
import type { SceneController } from "./sceneController";
import { CosmicScene } from "./CosmicScene";

/**
 * Phase 117b — `CosmicScene` reads the persisted `powerSaver` toggle
 * (`useSystemConfigQuery`) and must (a) thread it into the scene controller's
 * construction and live inputs and (b) fully remount (fresh controller
 * construction — antialias can't change on a live renderer) whenever the flag
 * flips. jsdom has no real WebGL (`canMountWebGL()` is false there — see that
 * module), so this test mocks it `true` and mocks `./sceneController` itself
 * (a fake, all-`vi.fn()` controller) rather than exercising the real
 * three.js scene — the actual power-saver render-loop behaviour (antialias,
 * the 30fps cap, the freeze/re-arm) is covered by `sceneController.test.ts`.
 * This test only asserts the React-level wiring: what gets passed to
 * `createSceneController` and when a fresh instance is created.
 */
const { config, mockCreateSceneController } = vi.hoisted(() => ({
  config: { current: null as SystemConfig | null },
  mockCreateSceneController: vi.fn(),
}));

vi.mock("../../system", () => ({
  useSystemConfigQuery: () => ({ data: config.current }),
}));

vi.mock("./canMountWebGL", () => ({ canMountWebGL: () => true }));

vi.mock("./sceneController", () => ({
  createSceneController: mockCreateSceneController,
}));

function fakeController(): SceneController {
  return {
    setInputs: vi.fn(),
    setSubsystems: vi.fn(),
    subscribeProjections: vi.fn(() => vi.fn()),
    pushActivity: vi.fn(),
    flashComplete: vi.fn(),
    emitFlight: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
    replayEntry: vi.fn(),
    scrubEntry: vi.fn(),
  };
}

/**
 * Phase 117d — a fake `IntersectionObserver` that captures its callback so
 * tests can fire synthetic entries (jsdom has no real one; `CosmicSceneView`
 * feature-detects and skips wiring it up when it's undefined, so tests that
 * exercise it must stub it globally before render).
 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
}

function intersect(observer: FakeIntersectionObserver, isIntersecting: boolean) {
  observer.callback(
    [{ isIntersecting } as unknown as IntersectionObserverEntry],
    observer as unknown as IntersectionObserver,
  );
}

beforeEach(() => {
  mockCreateSceneController.mockReset();
  mockCreateSceneController.mockImplementation(() => fakeController());
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CosmicScene — phase 117b powerSaver wiring", () => {
  it("passes the persisted powerSaver flag into the initial controller construction", async () => {
    config.current = SystemConfigSchema.parse({ powerSaver: true });
    render(<CosmicScene />);

    await waitFor(() => expect(mockCreateSceneController).toHaveBeenCalledTimes(1));
    const [, initialInputs] = mockCreateSceneController.mock.calls[0]!;
    expect(initialInputs).toMatchObject({ powerSaver: true });
  });

  it("defaults powerSaver to false when the config hasn't loaded yet", async () => {
    config.current = null;
    render(<CosmicScene />);

    await waitFor(() => expect(mockCreateSceneController).toHaveBeenCalledTimes(1));
    const [, initialInputs] = mockCreateSceneController.mock.calls[0]!;
    expect(initialInputs).toMatchObject({ powerSaver: false });
  });

  it("remounts — a fresh controller construction — when powerSaver flips", async () => {
    config.current = SystemConfigSchema.parse({ powerSaver: false });
    const { rerender } = render(<CosmicScene />);
    await waitFor(() => expect(mockCreateSceneController).toHaveBeenCalledTimes(1));
    const [, firstInputs] = mockCreateSceneController.mock.calls[0]!;
    expect(firstInputs).toMatchObject({ powerSaver: false });

    config.current = SystemConfigSchema.parse({ powerSaver: true });
    rerender(<CosmicScene />);

    await waitFor(() => expect(mockCreateSceneController).toHaveBeenCalledTimes(2));
    const [, secondInputs] = mockCreateSceneController.mock.calls[1]!;
    expect(secondInputs).toMatchObject({ powerSaver: true });
  });
});

/**
 * Phase 117d — three independent signals (tab visibility, window focus,
 * viewport intersection) collapse into one derived "should the loop run".
 * `resume()` is only called on the transition from "some reason blocked" to
 * "all clear" — these tests assert both the individual triggers and that
 * guard.
 */
describe("CosmicScene — phase 117d unified pause/resume gating", () => {
  it("initializes windowBlurred from document.hasFocus(): mounting into an unfocused window (jsdom default) starts paused, and focus resumes it", async () => {
    // jsdom's `document.hasFocus()` defaults to `false` — exactly the
    // "mounted into an already-unfocused window" case the plan calls out.
    config.current = SystemConfigSchema.parse({ powerSaver: false });
    render(<CosmicScene />);

    await waitFor(() => expect(mockCreateSceneController).toHaveBeenCalledTimes(1));
    const controller = mockCreateSceneController.mock.results[0]!.value as SceneController;
    await waitFor(() => expect(controller.pause).toHaveBeenCalledTimes(1));
    expect(controller.resume).not.toHaveBeenCalled();

    fireEvent.focus(window);
    expect(controller.resume).toHaveBeenCalledTimes(1);
  });

  it("window blur pauses a focused scene; focus resumes it", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    config.current = SystemConfigSchema.parse({ powerSaver: false });
    render(<CosmicScene />);

    await waitFor(() => expect(mockCreateSceneController).toHaveBeenCalledTimes(1));
    const controller = mockCreateSceneController.mock.results[0]!.value as SceneController;
    // Mounted focused, visible and on-screen — nothing should have paused it.
    expect(controller.pause).not.toHaveBeenCalled();

    fireEvent.blur(window);
    expect(controller.pause).toHaveBeenCalledTimes(1);
    expect(controller.resume).not.toHaveBeenCalled();

    fireEvent.focus(window);
    expect(controller.resume).toHaveBeenCalledTimes(1);
  });

  it("an IntersectionObserver reporting isIntersecting:false pauses; true resumes", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    config.current = SystemConfigSchema.parse({ powerSaver: false });
    render(<CosmicScene />);

    await waitFor(() => expect(mockCreateSceneController).toHaveBeenCalledTimes(1));
    const controller = mockCreateSceneController.mock.results[0]!.value as SceneController;
    const observer = FakeIntersectionObserver.instances[0]!;
    expect(controller.pause).not.toHaveBeenCalled();

    intersect(observer, false);
    expect(controller.pause).toHaveBeenCalledTimes(1);
    expect(controller.resume).not.toHaveBeenCalled();

    intersect(observer, true);
    expect(controller.resume).toHaveBeenCalledTimes(1);
  });

  it("does not resume until ALL blocking reasons clear (idempotency guard)", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    config.current = SystemConfigSchema.parse({ powerSaver: false });
    render(<CosmicScene />);

    await waitFor(() => expect(mockCreateSceneController).toHaveBeenCalledTimes(1));
    const controller = mockCreateSceneController.mock.results[0]!.value as SceneController;
    const observer = FakeIntersectionObserver.instances[0]!;
    expect(controller.pause).not.toHaveBeenCalled();

    // Block via TWO independent reasons: window blur, then off-screen.
    fireEvent.blur(window);
    expect(controller.pause).toHaveBeenCalledTimes(1);
    intersect(observer, false);
    // Already blocked (by blur) — the second blocking reason is a no-op, not
    // a second pause call.
    expect(controller.pause).toHaveBeenCalledTimes(1);

    // Clearing only ONE reason (focus) must NOT resume — off-screen still blocks.
    fireEvent.focus(window);
    expect(controller.resume).not.toHaveBeenCalled();

    // Clearing the second reason too — now all clear — resumes exactly once.
    intersect(observer, true);
    expect(controller.resume).toHaveBeenCalledTimes(1);
  });
});
