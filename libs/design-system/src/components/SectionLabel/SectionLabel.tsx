import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "../../lib/cn"

export interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional slot rendered at the right edge. */
  action?: ReactNode
  ref?: React.Ref<HTMLDivElement>
}

/** Uppercase mono section heading with an optional right-aligned action. */
export function SectionLabel({
  action,
  className,
  children,
  ref,
  ...props
}: SectionLabelProps) {
  return (
    <div
      ref={ref}
      className={cn("mb-3.5 flex items-baseline justify-between", className)}
      {...props}
    >
      <span className="font-mono text-caption uppercase tracking-widest text-foreground-faint">
        {children}
      </span>
      {action}
    </div>
  )
}
