import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";

export enum PressableTestId {
  Root = "pressable-root",
}

export type PressableChipTone = "run" | "warn" | "bad";

/** Pill shape + tone-tinted hover/`aria-expanded`/focus-ring — the chat
 *  top-bar status pill's working/waiting/error flyout triggers. */
const chipToneClass: Record<PressableChipTone, string> = {
  run: cn(
    "rounded-full px-2 py-0.5 transition-colors hover:bg-run/15 aria-expanded:bg-run/15",
    "outline-none focus-visible:ring-1 focus-visible:ring-run",
  ),
  warn: cn(
    "rounded-full px-2 py-0.5 transition-colors hover:bg-warn/15 aria-expanded:bg-warn/15",
    "outline-none focus-visible:ring-1 focus-visible:ring-warn",
  ),
  bad: cn(
    "rounded-full px-2 py-0.5 transition-colors hover:bg-bad/15 aria-expanded:bg-bad/15",
    "outline-none focus-visible:ring-1 focus-visible:ring-bad",
  ),
};

export interface PressableProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  ref?: Ref<HTMLButtonElement>;
  /** Tints the pressable as a status-tone pill (hover fill, `aria-expanded`
   *  fill, tone-colored focus ring) instead of the plain reset-only look. */
  chipTone?: PressableChipTone;
}

/**
 * Unstyled, accessible button for wrapping custom content (clickable badges,
 * icons, rows). Resets native chrome and keeps only a focus ring, unless
 * `chipTone` opts into the status-pill look instead.
 */
export function Pressable({ type = "button", ref, chipTone, ...rest }: PressableProps) {
  return (
    <button
      className={cn(
        "cursor-pointer border-none bg-transparent p-0 text-inherit rounded-sm",
        chipTone ? chipToneClass[chipTone] : focusRing,
      )}
      data-testid={PressableTestId.Root}
      ref={ref}
      type={type}
      {...rest}
    />
  );
}
