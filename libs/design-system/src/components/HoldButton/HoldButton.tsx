"use client";
import {
  type ButtonHTMLAttributes,
  type Ref,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../../utils/cn";
import { disabledClasses, focusRingOffset } from "../../utils/focus";
import { Icon } from "../Icon/Icon";

export type HoldButtonTone = "warn" | "bad" | "ok" | "accent";

const toneClass: Record<HoldButtonTone, string> = {
  warn: "text-warn bg-warn/[0.08] border-warn/40",
  bad: "text-bad bg-bad/[0.08] border-bad/40",
  ok: "text-ok bg-ok/[0.08] border-ok/40",
  accent: "text-accent bg-accent/[0.08] border-accent/40",
};

const fillClass: Record<HoldButtonTone, string> = {
  warn: "bg-warn/[0.18]",
  bad: "bg-bad/[0.18]",
  ok: "bg-ok/[0.18]",
  accent: "bg-accent/[0.18]",
};

/** How long the button must be held before it confirms. */
export const HOLD_DURATION_MS = 900;

export enum HoldButtonTestId {
  Root = "hold-button-root",
  Fill = "hold-button-fill",
  Icon = "hold-button-icon",
}

export interface HoldButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "onClick" | "children"
  > {
  /** Fired once the hold completes. */
  onConfirm?: () => void;
  /** Idle label. */
  label?: string;
  /** Label shown after the hold completes. */
  doneLabel?: string;
  tone?: HoldButtonTone;
  block?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Hold-to-confirm button (design `ZtHold`) — the double-confirmation guardrail
 * for high-risk approvals (payment, deletion). A 0.9s press fills the button
 * left-to-right; releasing early rolls the fill back without confirming.
 */
export function HoldButton({
  onConfirm,
  label = "Hold to confirm",
  doneLabel = "Confirmed",
  tone = "warn",
  block,
  disabled,
  ref,
  ...props
}: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef<number>(0);
  const start = useRef<number>(0);
  const holding = useRef(false);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const tick = (now: number) => {
    if (!holding.current) return;
    const pct = Math.min(1, (now - start.current) / HOLD_DURATION_MS);
    setProgress(pct);
    if (pct >= 1) {
      holding.current = false;
      setDone(true);
      onConfirm?.();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const beginHold = () => {
    if (done || disabled || holding.current) return;
    holding.current = true;
    start.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  };

  const endHold = () => {
    if (!holding.current) return;
    holding.current = false;
    cancelAnimationFrame(raf.current);
    setProgress(0);
  };

  return (
    <button
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 overflow-hidden select-none",
        "rounded-sm border px-[18px] py-[11px] font-mono text-caption font-bold tracking-[0.02em]",
        "cursor-pointer whitespace-nowrap transition-colors duration-200",
        done ? "border-ok bg-ok text-accent-contrast" : toneClass[tone],
        block && "w-full",
        focusRingOffset,
        disabledClasses,
      )}
      data-testid={HoldButtonTestId.Root}
      disabled={disabled}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) beginHold();
      }}
      onKeyUp={endHold}
      onPointerCancel={endHold}
      onPointerDown={beginHold}
      onPointerLeave={endHold}
      onPointerUp={endHold}
      ref={ref}
      type="button"
      {...props}
    >
      {!done && (
        <span
          className={cn(
            "absolute inset-y-0 left-0",
            fillClass[tone],
            progress === 0 && "transition-[width] duration-200",
          )}
          data-testid={HoldButtonTestId.Fill}
          style={{ width: `${progress * 100}%` }}
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">
        {done && (
          <Icon data-testid={HoldButtonTestId.Icon} name="check" size="sm" stroke="bold" />
        )}
        {done ? doneLabel : label}
      </span>
    </button>
  );
}
