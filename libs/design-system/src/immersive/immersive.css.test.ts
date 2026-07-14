import { afterEach, describe, expect, it } from "vitest";
import { ensureImmersiveCss, resetImmersiveCss } from "./immersive.css";

afterEach(() => resetImmersiveCss());

describe("ensureImmersiveCss", () => {
  it("injects a single style node marked with the immersive-css attribute", () => {
    ensureImmersiveCss();
    const nodes = document.querySelectorAll("style[data-immersive-css]");
    expect(nodes).toHaveLength(1);
  });

  it("is idempotent — a second call does not inject a duplicate node", () => {
    ensureImmersiveCss();
    ensureImmersiveCss();
    expect(document.querySelectorAll("style[data-immersive-css]")).toHaveLength(1);
  });

  it("includes every im* keyframe and the reduced-motion reset", () => {
    ensureImmersiveCss();
    const css = document.querySelector("style[data-immersive-css]")?.textContent ?? "";
    for (const name of [
      "imSpin",
      "imShadow",
      "imRing",
      "imHalo",
      "imFloat",
      "imDash",
      "imFlareFly",
      "imFlareBurstRing",
      "imFlareBurstCore",
      "imFlareLaunch",
    ]) {
      expect(css).toContain(`@keyframes ${name}`);
    }
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain('[class^="im-"], .im-anim { animation: none !important; }');
  });

  it("carries no leftover vc* keyframe names from the ported prototype", () => {
    ensureImmersiveCss();
    const css = document.querySelector("style[data-immersive-css]")?.textContent ?? "";
    expect(css).not.toMatch(/@keyframes vc/);
  });
});

describe("resetImmersiveCss", () => {
  it("removes the injected style node so a later call re-injects", () => {
    ensureImmersiveCss();
    resetImmersiveCss();
    expect(document.querySelectorAll("style[data-immersive-css]")).toHaveLength(0);
    ensureImmersiveCss();
    expect(document.querySelectorAll("style[data-immersive-css]")).toHaveLength(1);
  });

  it("is a safe no-op when nothing was injected", () => {
    expect(() => resetImmersiveCss()).not.toThrow();
  });
});
