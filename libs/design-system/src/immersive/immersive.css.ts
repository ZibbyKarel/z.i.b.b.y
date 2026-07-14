/**
 * Shared `@keyframes` injector for the immersive orb-map bundle (`ConnectorLayer`,
 * `Orb`, `OrbitField`, `HandoffFlare`, …). These are one-off orb-map motion curves,
 * not design tokens, so they don't belong in the shared Tailwind theme — instead each
 * immersive component calls `ensureImmersiveCss()` from its mount effect, and the first
 * call injects a single `<style>` node into `document.head`; every later call is a no-op.
 *
 * Keyframe bodies are ported verbatim from the original orb-map prototype's `vc-css-d`
 * style block (`design/Z.I.B.B.Y/zibby/velin-d-map.jsx`), renamed `vc*` → `im*`.
 */

const STYLE_MARKER_ATTR = "data-immersive-css";

const IMMERSIVE_CSS = `
@keyframes imSpin { to { transform: rotate(360deg); } }
@keyframes imShadow { 0%,100% { transform: translateX(-50%) scaleX(1); opacity: .5; } 50% { transform: translateX(-50%) scaleX(.82); opacity: .32; } }
@keyframes imRing { 0% { transform: scale(.72); opacity: .5; } 100% { transform: scale(2.1); opacity: 0; } }
@keyframes imHalo { 0%,100% { opacity: .45; } 50% { opacity: .9; } }
@keyframes imFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes imDash { to { stroke-dashoffset: -80; } }
@keyframes imFlareFly { 0% { offset-distance: 0%; opacity: 0; } 6% { opacity: 1; } 88% { opacity: 1; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes imFlareBurstRing { 0% { transform: translate(-50%,-50%) scale(.3); opacity: .9; } 100% { transform: translate(-50%,-50%) scale(2.6); opacity: 0; } }
@keyframes imFlareBurstCore { 0%,55% { transform: translate(-50%,-50%) scale(0); opacity: 0; } 68% { transform: translate(-50%,-50%) scale(1.6); opacity: 1; } 100% { transform: translate(-50%,-50%) scale(.4); opacity: 0; } }
@keyframes imFlareLaunch { 0% { transform: translate(-50%,-50%) scale(.4); opacity: .95; } 100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  [class^="im-"], .im-anim { animation: none !important; }
}
`;

/**
 * Injects the shared immersive `@keyframes` into `document.head`, once per document.
 * SSR-safe — a no-op when `document` doesn't exist. Idempotent — safe to call from
 * every immersive component's mount effect; only the first call actually creates the
 * `<style>` node (guarded by the `data-immersive-css` marker attribute).
 */
export function ensureImmersiveCss(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[${STYLE_MARKER_ATTR}]`)) return;
  const style = document.createElement("style");
  style.setAttribute(STYLE_MARKER_ATTR, "true");
  style.textContent = IMMERSIVE_CSS;
  document.head.appendChild(style);
}

/**
 * Test seam — removes the injected `<style>` node (if any) so a test can re-assert
 * injection from a clean slate. No-op outside a DOM environment.
 */
export function resetImmersiveCss(): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll(`style[${STYLE_MARKER_ATTR}]`).forEach((node) => node.remove());
}
