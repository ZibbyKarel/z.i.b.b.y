import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";

export enum SurfaceTestId {
  Root = "surface-root",
  Content = "surface-content",
}

const gridOverlay: CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
  backgroundSize: "56px 56px",
  WebkitMaskImage:
    "radial-gradient(ellipse 100% 90% at 60% 0%, #000 20%, transparent 85%)",
  maskImage:
    "radial-gradient(ellipse 100% 90% at 60% 0%, #000 20%, transparent 85%)",
};

const scanOverlay: CSSProperties = {
  mixBlendMode: "overlay",
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)",
};

const bgClass: Record<NonNullable<SurfaceProps["background"]>, string> = {
  surface: "bg-surface",
  background: "bg-background",
};

export interface SurfaceProps extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  background?: "surface" | "background";
  /** Decorative blueprint grid overlay. */
  grid?: boolean;
  /** Decorative scanline overlay. */
  scanlines?: boolean;
  as?: "div" | "main" | "section";
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/**
 * Full-bleed app shell surface that hosts the optional decorative HUD overlays
 * (blueprint grid + scanlines). Content renders above the overlays.
 */
export function Surface({
  background = "surface",
  grid = false,
  scanlines = false,
  as: Tag = "div",
  children,
  ref,
  ...rest
}: SurfaceProps) {
  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(rest as any)}
      className={cn(
        "relative h-full w-full overflow-hidden font-sans text-foreground",
        bgClass[background],
      )}
      data-testid={SurfaceTestId.Root}
      ref={ref as Ref<HTMLDivElement>}
    >
      {grid && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-35"
          style={gridOverlay}
        />
      )}
      {scanlines && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-30"
          style={scanOverlay}
        />
      )}
      <div className="relative z-[1] flex h-full" data-testid={SurfaceTestId.Content}>
        {children}
      </div>
    </Tag>
  );
}
