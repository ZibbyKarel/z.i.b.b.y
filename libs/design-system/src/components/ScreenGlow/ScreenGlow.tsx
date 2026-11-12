import type { HTMLAttributes, Ref } from "react";

export enum ScreenGlowTestId {
  Root = "screen-glow-root",
  Ring = "screen-glow-ring",
}

export interface ScreenGlowProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  ref?: Ref<HTMLDivElement>;
}

/**
 * A Siri-like soft multicolour glow along the whole viewport edge — the "ZIBBY is
 * acting on its own" signal (Autopilot on). Mount it only while that state holds.
 *
 * Fixed over the viewport, decorative (`aria-hidden`) and `pointer-events: none`, so
 * it never blocks content. The blurred outer layer softens the masked `zb-screen-glow`
 * ring (a slowly rotating conic gradient of the state-tone tokens, see `globals.css`);
 * under `prefers-reduced-motion` the ring stays static.
 *
 * Deliberate exception to the matte "no glow" canon (DS.md §1.2): the operator asked
 * for this one ambient signal explicitly (TODO 18).
 */
export function ScreenGlow({ ref, ...rest }: ScreenGlowProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] blur-md"
      data-testid={ScreenGlowTestId.Root}
      ref={ref}
      {...rest}
    >
      <div className="zb-screen-glow absolute inset-0" data-testid={ScreenGlowTestId.Ring} />
    </div>
  );
}
