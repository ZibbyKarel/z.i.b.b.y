"use client";

import type { Ref } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { disabledClasses, focusRingOffset } from "../../utils/focus";
import { Icon } from "../Icon/Icon";
import { StateDot } from "../StatePill/StatePill";

export enum ConfirmDeleteButtonTestId {
  Root = "confirm-delete-button-root",
  Icon = "confirm-delete-button-icon",
  Dot = "confirm-delete-button-dot",
}

/** How long the armed (confirm-pending) state stays live before reverting. */
export const CONFIRM_DELETE_TIMEOUT_MS = 3000;

export interface ConfirmDeleteButtonProps {
  onConfirm: () => void;
  /** Idle label. */
  label?: string;
  /** Label shown after the first click, prompting the second. */
  confirmLabel?: string;
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The one confirm-delete control (NC1) — a two-click guardrail: a first click
 * arms the button (border/color escalate to `bad`, a dot appears, the label
 * swaps to `confirmLabel`); a second click within
 * {@link CONFIRM_DELETE_TIMEOUT_MS} fires `onConfirm`. The armed state times
 * out back to idle on its own, and blur disarms it immediately.
 */
export function ConfirmDeleteButton({
  onConfirm,
  label = "Delete",
  confirmLabel = "Confirm delete",
  disabled,
  ref,
}: ConfirmDeleteButtonProps) {
  const [armed, setArmed] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  const disarm = () => {
    clearTimeout(timeout.current);
    setArmed(false);
  };

  const handleClick = () => {
    if (armed) {
      disarm();
      onConfirm();
      return;
    }
    setArmed(true);
    timeout.current = setTimeout(disarm, CONFIRM_DELETE_TIMEOUT_MS);
  };

  return (
    <button
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-none border font-mono font-semibold uppercase tracking-wider",
        "cursor-pointer px-[10px] py-[6px] text-[11px] transition-colors duration-150",
        focusRingOffset,
        disabledClasses,
        armed
          ? "border-bad bg-bad/10 text-bad"
          : "border-line-2 bg-transparent text-ink-2 hover:border-bad hover:text-bad",
      )}
      data-testid={ConfirmDeleteButtonTestId.Root}
      disabled={disabled}
      onBlur={disarm}
      onClick={handleClick}
      ref={ref}
      type="button"
    >
      {armed ? (
        <StateDot data-testid={ConfirmDeleteButtonTestId.Dot} px={7} state="error" />
      ) : (
        <Icon data-testid={ConfirmDeleteButtonTestId.Icon} name="trash" size="xs" stroke="medium" />
      )}
      {armed ? confirmLabel : label}
    </button>
  );
}
