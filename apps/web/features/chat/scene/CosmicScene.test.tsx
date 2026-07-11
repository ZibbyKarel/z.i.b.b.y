import { type SystemConfig, SystemConfigSchema } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, waitFor } from "../../../test/render";
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

beforeEach(() => {
  mockCreateSceneController.mockReset();
  mockCreateSceneController.mockImplementation(() => fakeController());
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
