import type { HTMLAttributes, ReactNode } from "react";
import { Stack, Typography } from "@zibby/design-system";

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
      <Typography
        mono
        uppercase
        as="span"
        size="caption"
        tracking="widest"
        type="note"
        variant="tertiary"
      >
        {children}
      </Typography>
      {action}
    </Stack>
  );
}
