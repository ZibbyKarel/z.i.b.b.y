import { afterEach, describe, expect, it } from "vitest";
import { canMountWebGL, resetCanMountWebGLCache } from "./canMountWebGL";

afterEach(() => resetCanMountWebGLCache());

describe("canMountWebGL", () => {
  it("returns false under jsdom (no real WebGL context)", () => {
    expect(canMountWebGL()).toBe(false);
  });

  it("memoizes the first read", () => {
    const first = canMountWebGL();
    expect(canMountWebGL()).toBe(first);
  });
});
