"use client";
import { type ButtonHTMLAttributes, type Ref, useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { disabledClasses, focusRingOffset } from "../../utils/focus";
import { Icon } from "../Icon/Icon";

export type HoldButtonTone = "warn" | "bad" | "ok" | "accent";

/** Two footprints on the shared button scale: `md` is the standalone approval
 * default; `sm` matches `Button size="sm"` so the control sits flush beside its
 * peers in dense chrome like the top bar. */
export type HoldButtonSize = "sm" | "md";

const sizeClass: Record<HoldButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-[18px] py-[11px] text-caption",
};

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
  Label = "hold-button-label",
  /** The armed-state label — present only while the button is armed. */
  ArmedLabel = "hold-button-armed-label",
}

export interface HoldButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "onClick" | "children"
> {
  /** Fired once the hold completes, or on the second discrete activation when armed. */
  onConfirm?: () => void;
  /** Idle label. */
  label?: string;
  /** Label shown after the confirmation completes. */
  doneLabel?: string;
  /**
   * Label shown while armed (Fáze 17.2): a short press/click arms the button
   * instead of silently rolling back, and this label prompts the second,
   * discrete activation that confirms. DS is i18n-agnostic — English default,
   * consumers override via props.
   */
  armedLabel?: string;
  tone?: HoldButtonTone;
  size?: HoldButtonSize;
  block?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Hold-to-confirm button (design `ZtHold`) — the double-confirmation guardrail
 * for high-risk approvals (payment, deletion). A 0.9s press fills the button
 * left-to-right; releasing early no longer silently rolls back: it **arms** the
 * button (full pulsing fill + `armedLabel`), and a second discrete activation
 * (click, or a short Space/Enter press) confirms — a timing-free alternative for
 * motor impairments, switch access, and voice control (WCAG 2.5.1/2.2.1). The
 * armed state has NO expiry window; `Escape` or blur disarms it. A completed
 * hold still confirms directly, armed or not.
 */
export function HoldButton({
  onConfirm,
  label = "Hold to confirm",
  doneLabel = "Confirmed",
  armedLabel = "Press again to confirm",
  tone = "warn",
  size = "md",
  block,
  disabled,
  ref,
  ...props
}: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [armed, setArmed] = useState(false);
  const raf = useRef<number>(0);
  const start = useRef<number>(0);
  const holding = useRef(false);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const confirm = () => {
    setArmed(false);
    setDone(true);
    onConfirm?.();
  };

  const tick = (now: number) => {
    if (!holding.current) return;
    const pct = Math.min(1, (now - start.current) / HOLD_DURATION_MS);
    setProgress(pct);
    if (pct >= 1) {
      holding.current = false;
      confirm();
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

  /** Stop an in-flight hold without treating it as an activation (drag-off, Escape,
   * blur). Returns whether a hold was actually in flight. */
  const cancelHold = () => {
    if (!holding.current) return false;
    holding.current = false;
    cancelAnimationFrame(raf.current);
    setProgress(0);
    return true;
  };

  /** A press released before the hold completed = one discrete activation:
   * first arms, second (while armed) confirms. Timing-free by design — the
   * armed state never expires on its own. */
  const releaseHold = () => {
    if (!cancelHold()) return;
    if (armed) {
      confirm();
    } else {
      setArmed(true);
    }
  };

  const disarm = () => {
    cancelHold();
    setArmed(false);
  };

  return (
    <button
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 overflow-hidden select-none",
        "rounded-sm border font-mono font-bold tracking-[0.02em]",
        sizeClass[size],
        "cursor-pointer whitespace-nowrap transition-colors duration-200",
        done ? "border-ok bg-ok text-accent-contrast" : toneClass[tone],
        block && "w-full",
        focusRingOffset,
        disabledClasses,
      )}
      data-testid={HoldButtonTestId.Root}
      disabled={disabled}
      onBlur={disarm}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) beginHold();
        if (e.key === "Escape") disarm();
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") releaseHold();
      }}
      onPointerCancel={cancelHold}
      onPointerDown={beginHold}
      onPointerLeave={cancelHold}
      onPointerUp={releaseHold}
      ref={ref}
      type="button"
      {...props}
    >
      {!done && (
        <span
          className={cn(
            "absolute inset-y-0 left-0",
            fillClass[tone],
            armed && "w-full animate-pulse",
            !armed && progress === 0 && "transition-[width] duration-200",
          )}
          data-testid={HoldButtonTestId.Fill}
          style={armed ? undefined : { width: `${progress * 100}%` }}
        />
      )}
      {/* aria-live so the label swap (idle → armed → done) is announced; the armed
          state is conveyed by descriptive text, not aria-pressed (not a toggle). */}
      <span
        aria-live="polite"
        className="relative inline-flex items-center gap-1.5"
        data-testid={HoldButtonTestId.Label}
      >
        {done && <Icon data-testid={HoldButtonTestId.Icon} name="check" size="sm" stroke="bold" />}
        {done ? (
          doneLabel
        ) : armed ? (
          <span data-testid={HoldButtonTestId.ArmedLabel}>{armedLabel}</span>
        ) : (
          label
        )}
      </span>
    </button>
  );
}
