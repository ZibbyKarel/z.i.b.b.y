import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";

export enum PressableTestId {
  Root = "pressable-root",
}

export interface PressableProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> {
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Unstyled, accessible button for wrapping custom content (clickable badges,
 * icons, rows). Resets native chrome and keeps only a focus ring.
 */
export function Pressable({ type = "button", ref, ...rest }: PressableProps) {
  return (
    <button
      className={cn(
        "cursor-pointer border-none bg-transparent p-0 text-inherit",
        "rounded-sm",
        focusRing,
      )}
      data-testid={PressableTestId.Root}
      ref={ref}
      type={type}
      {...rest}
    />
  );
}
