import { describe, expect, it } from "vitest";
import { orbTarget } from "./modeVisuals";
import type { SceneMode } from "./sceneTypes";

const MODES: SceneMode[] = [
  "idle",
  "listening",
  "thinking",
  "streaming",
  "speaking",
  "tool",
  "waiting-approval",
  "error",
];

describe("orbTarget", () => {
  it("keeps every mode's intensity near-full — no more heavy dimming", () => {
    for (const mode of MODES) {
      expect(orbTarget(mode, 0).intensity).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("resolves idle to the calm accent token", () => {
    expect(orbTarget("idle", 0).colorToken).toBe("accent");
  });

  it("resolves the working modes to a different token than idle (the run hue)", () => {
    const idleToken = orbTarget("idle", 0).colorToken;
    for (const mode of ["thinking", "tool", "streaming"] as const) {
      const target = orbTarget(mode, 0);
      expect(target.colorToken).toBe("run");
      expect(target.colorToken).not.toBe(idleToken);
    }
  });

  it("streaming folds the energy signal into noise/pulse without touching intensity", () => {
    const quiet = orbTarget("streaming", 0);
    const loud = orbTarget("streaming", 1);
    expect(loud.noiseAmp).toBeGreaterThan(quiet.noiseAmp);
    expect(loud.pulseAmp).toBeGreaterThan(quiet.pulseAmp);
    expect(loud.intensity).toBe(quiet.intensity);
  });
});
