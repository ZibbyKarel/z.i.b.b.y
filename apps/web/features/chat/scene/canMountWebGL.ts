/**
 * `true` only where a real WebGL context can be created. jsdom (component tests)
 * and GPU-less environments return `false`, so the scene controller is never
 * instantiated there — three.js would throw building a `WebGLRenderer`. Read once
 * and cached; the caller renders its DOM root regardless, so a `false` result is a
 * quiet no-op, never a crash.
 */
let cached: boolean | null = null;

export function canMountWebGL(): boolean {
  if (cached !== null) return cached;
  if (typeof document === "undefined" || typeof window === "undefined") {
    cached = false;
    return cached;
  }
  // Pre-check the WebGL global constructors: real browsers define them, jsdom does
  // not. This short-circuits before `getContext` — which jsdom logs a noisy
  // "Not implemented" error for — so component tests stay quiet.
  const hasWebGLGlobals =
    typeof (window as unknown as { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext !==
      "undefined" ||
    typeof (window as unknown as { WebGLRenderingContext?: unknown }).WebGLRenderingContext !==
      "undefined";
  if (!hasWebGLGlobals) {
    cached = false;
    return cached;
  }
  try {
    const canvas = document.createElement("canvas");
    cached = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    cached = false;
  }
  return cached;
}
