import type { HTMLAttributes, ReactNode } from "react";
import { Stack } from "@zibby/design-system";

export interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  action?: ReactNode;
  ref?: React.Ref<HTMLElement>;
}

export function SectionLabel({
  action,
  children,
  ref,
  style,
  ...props
}: SectionLabelProps) {
  return (
    <Stack
      align="baseline"
      direction="row"
      justify="between"
      ref={ref}
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
    </Stack>
  );
}
