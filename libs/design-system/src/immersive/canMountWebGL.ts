/**
 * `true` only where a real WebGL context can be created. jsdom (component tests)
 * and GPU-less environments return `false`, so an `Orb` renders its DOM root but
 * never constructs a `WebGLRenderer` there — a quiet no-op, never a crash. Read
 * once and cached.
 */
let cached: boolean | null = null;

export function canMountWebGL(): boolean {
  if (cached !== null) return cached;
  if (typeof document === "undefined" || typeof window === "undefined") {
    cached = false;
    return cached;
  }
  const w = window as unknown as {
    WebGL2RenderingContext?: unknown;
    WebGLRenderingContext?: unknown;
  };
  const hasWebGLGlobals =
    typeof w.WebGL2RenderingContext !== "undefined" ||
    typeof w.WebGLRenderingContext !== "undefined";
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

/** Test seam — reset the memoized capability read. */
export function resetCanMountWebGLCache(): void {
  cached = null;
}
