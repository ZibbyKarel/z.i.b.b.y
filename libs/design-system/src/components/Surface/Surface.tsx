import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";

export enum SurfaceTestId {
  Root = "surface-root",
  Content = "surface-content",
}

const bgClass: Record<NonNullable<SurfaceProps["background"]>, string> = {
  surface: "bg-surface",
  background: "bg-background",
  /** App-shell scene — depth via radial gradient, no decorative overlays. */
  scene: "bg-background bg-[image:var(--gradient-scene)]",
};

export interface SurfaceProps extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  background?: "surface" | "background" | "scene";
  as?: "div" | "main" | "section";
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/**
 * Full-bleed app shell surface. The `scene` background carries the room's
 * depth (radial gradient + vignette) — the quiet control room has no
 * scanline or grid overlays.
 */
export function Surface({
  background = "surface",
  as = "div",
  children,
  ref,
  ...rest
}: SurfaceProps) {
  // `div`/`main`/`section` share the same `HTMLAttributes<HTMLElement>` shape — a
  // variable JSX tag typed as their string-literal union can't resolve props/ref
  // against all three at once, so narrow to one for typing only. The real tag
  // rendered at runtime is still whatever `as` holds; this cast doesn't change it.
  const Tag = as as "div";
  return (
    <Tag
      className={cn(
        "relative h-full w-full overflow-hidden font-sans text-foreground",
        bgClass[background],
      )}
      data-testid={SurfaceTestId.Root}
      ref={ref as Ref<HTMLDivElement>}
      {...rest}
    >
      <div className="relative z-[1] flex h-full" data-testid={SurfaceTestId.Content}>
        {children}
      </div>
    </Tag>
  );
}
