import type { HTMLAttributes, ReactNode } from "react";
import { cn, Corners } from "@zibby/design-system";

export interface HudPanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  action?: ReactNode;
  corners?: boolean;
  ref?: React.Ref<HTMLDivElement>;
}

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
      {corners && <Corners inset="75" />}
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
