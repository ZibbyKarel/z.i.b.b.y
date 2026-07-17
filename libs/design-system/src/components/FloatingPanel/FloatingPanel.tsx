import type { CSSProperties, ReactNode } from "react";

export enum FloatingPanelTestId {
  Root = "floating-panel-root",
}

export interface FloatingPanelProps {
  children: ReactNode;
  /** Stagger seed — typically the item's list index. Panels sharing the same
   *  index float in lockstep; vary it (e.g. list index) to break the
   *  synchronized wave. Defaults to 0 (a single un-staggered panel). */
  index?: number;
}

/**
 * Ambient "floating on water" drift for otherwise-idle content — a pure
 * transform host with no background, border, or radius of its own, so it
 * never changes the wrapped content's appearance or hitbox beyond a few
 * pixels of vertical drift. Reuses the shared `zt-float` keyframe
 * (`libs/design-system/src/theme/globals.css`), staggered per `index` so
 * multiple panels never move in unison. Honours `prefers-reduced-motion`
 * via Tailwind's `motion-reduce:` variant — the same mechanism
 * {@link LivingGlow} uses, rather than a separate animation-toggle switch.
 */
export function FloatingPanel({ children, index = 0 }: FloatingPanelProps) {
  const style: CSSProperties = {
    animationDelay: `${index * -1.3}s`,
    animationDuration: `${6 + (index % 4) * 0.7}s`,
  };
  return (
    <div
      className="w-full animate-zt-float motion-reduce:animate-none"
      data-testid={FloatingPanelTestId.Root}
      style={style}
    >
      {children}
    </div>
  );
}
