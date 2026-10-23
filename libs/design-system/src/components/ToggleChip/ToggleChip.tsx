import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";

export enum ToggleChipTestId {
  Root = "toggle-chip-root",
  Leading = "toggle-chip-leading",
}

export interface ToggleChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> {
  pressed: boolean;
  /** Small leading visual, e.g. a small AgentBadge. */
  leading?: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/** Bordered toggle chip (mono, uppercase) — e.g. the TO recipient chips of the
 * Run Detail composer. Pressed = ink border + ink text. */
export function ToggleChip({ pressed, leading, children, ref, ...rest }: ToggleChipProps) {
  return (
    <button
      aria-pressed={pressed}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-sm border py-[3px] pr-2 font-sans text-[12px] font-medium",
        leading ? "pl-1" : "pl-2",
        pressed ? "border-foreground text-foreground" : "border-border-strong text-foreground-dim",
        focusRing,
      )}
      data-testid={ToggleChipTestId.Root}
      ref={ref}
      type="button"
      {...rest}
    >
      {leading && <span data-testid={ToggleChipTestId.Leading}>{leading}</span>}
      {children}
    </button>
  );
}
