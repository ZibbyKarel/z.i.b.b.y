import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";

export enum KbdTestId {
  Root = "kbd-root",
}

export interface KbdProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "className"
> {
  ref?: Ref<HTMLElement>;
}

export function Kbd({ ref, children, ...rest }: KbdProps) {
  return (
    <kbd
      data-testid={KbdTestId.Root}
      {...rest}
      ref={ref as Ref<HTMLElement>}
      className={cn(
        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px]",
        "font-mono text-xs font-medium leading-none",
        "text-foreground-dim bg-raised border border-border-strong rounded-sm",
        "shadow-[0_1px_0_var(--color-border-strong)]",
      )}
    >
      {children}
    </kbd>
  );
}
