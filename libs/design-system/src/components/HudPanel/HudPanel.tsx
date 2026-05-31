import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface CornersProps {
  /** Inset of the brackets from the panel edge, in px. */
  inset?: number;
  className?: string;
}

/** Decorative HUD corner brackets ("chevrons") drawn in the accent color. */
export function Corners({ inset = 5, className }: CornersProps) {
  const base = "pointer-events-none absolute h-3 w-3 border-accent opacity-60";
  return (
    <>
      <span
        className={cn(base, "border-t-[1.5px] border-l-[1.5px]", className)}
        style={{ top: inset, left: inset }}
      />
      <span
        className={cn(base, "border-t-[1.5px] border-r-[1.5px]", className)}
        style={{ top: inset, right: inset }}
      />
      <span
        className={cn(base, "border-b-[1.5px] border-l-[1.5px]", className)}
        style={{ bottom: inset, left: inset }}
      />
      <span
        className={cn(base, "border-b-[1.5px] border-r-[1.5px]", className)}
        style={{ bottom: inset, right: inset }}
      />
    </>
  );
}

export interface HudPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional `// TITLE` mono caption row. */
  title?: string;
  /** Slot rendered at the right edge of the title row. */
  action?: ReactNode;
  /** Show accent corner brackets. */
  corners?: boolean;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * The signature angular dashboard surface: squared panel, accent corner brackets
 * and a `// title` mono caption — variant B reskinned with variant C's HUD chrome.
 */
export function HudPanel({
  title,
  action,
  corners = true,
  className,
  children,
  ref,
  ...props
}: HudPanelProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative border border-border bg-[rgba(13,17,23,0.72)] p-4",
        className,
      )}
      {...props}
    >
      {corners && <Corners inset={5} />}
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && (
            <span className="font-mono text-xs uppercase tracking-widest text-foreground-faint">
              <span className="text-accent opacity-80">//</span> {title}
            </span>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
