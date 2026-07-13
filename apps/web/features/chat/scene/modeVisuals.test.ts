import { describe, expect, it } from "vitest";
import { miniOrbTarget, orbTarget } from "./modeVisuals";
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

  // Velín-D breathing retune (task B1): thinking churns faster than idle, and a
  // parked/awaiting-approval orb breathes SLOWER than idle (a longer breath — a
  // patient, non-urgent cadence — is a smaller pulseSpeed, the inverse relation).
  it("thinking churns faster than idle (Velín-D ORB_MOTION.speed)", () => {
    expect(orbTarget("thinking", 0).noiseSpeed).toBeGreaterThan(orbTarget("idle", 0).noiseSpeed);
  });

  it("waiting-approval breathes slower than idle — longer breath, smaller pulseSpeed", () => {
    expect(orbTarget("waiting-approval", 0).pulseSpeed).toBeLessThan(
      orbTarget("idle", 0).pulseSpeed,
    );
  });

  it("streaming/tool land on the same working-ish motion (Velín-D bezi target)", () => {
    const streaming = orbTarget("streaming", 0);
    const tool = orbTarget("tool", 0);
    expect(tool.noiseAmp).toBeCloseTo(streaming.noiseAmp, 5);
    expect(tool.noiseSpeed).toBeCloseTo(streaming.noiseSpeed, 5);
    expect(tool.glow).toBeCloseTo(streaming.glow, 5);
  });

  it("idle breathes (nonzero pulseSpeed) even though nothing else is happening", () => {
    expect(orbTarget("idle", 0).pulseSpeed).toBeGreaterThan(0);
  });
});

describe("miniOrbTarget", () => {
  it("bezi (working) churns faster than klid (idle) — Velín-D ORB_MOTION.speed", () => {
    expect(miniOrbTarget("#fff", "bezi").noiseSpeed).toBeGreaterThan(
      miniOrbTarget("#fff", "klid").noiseSpeed,
    );
  });

  it("ceka (awaiting a decision) breathes slower than klid — longer breath, smaller pulseSpeed", () => {
    expect(miniOrbTarget("#fff", "ceka").pulseSpeed).toBeLessThan(
      miniOrbTarget("#fff", "klid").pulseSpeed,
    );
  });

  it("keeps the mini-orb color override and zero rings for every state", () => {
    for (const state of ["klid", "bezi", "hlaseni", "ceka"] as const) {
      const target = miniOrbTarget("#abcdef", state);
      expect(target.color).toBe("#abcdef");
      expect(target.rings).toBe(0);
    }
  });
});
