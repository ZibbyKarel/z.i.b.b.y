import type { HTMLAttributes, ReactNode } from "react"
import { Row } from "@zibby/design-system"

export interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  action?: ReactNode
  ref?: React.Ref<HTMLElement>
}

export function SectionLabel({ action, children, ref, style, ...props }: SectionLabelProps) {
  return (
    <Row
      ref={ref}
      align="baseline"
      justify="between"
      style={{ marginBottom: "0.875rem", ...style }}
      {...props}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-caption)",
          textTransform: "uppercase",
          letterSpacing: "var(--tracking-widest)",
          color: "var(--color-foreground-faint)",
        }}
      >
        {children}
      </span>
      {action}
    </Row>
  )
}
