import { type ButtonHTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils/cn";
import { disabledClasses, focusRingOffset } from "../../utils/focus";
import { Icon, type IconName } from "../Icon/Icon";

/**
 * The single button system (design `ZtBtn`):
 *   primary — filled accent, dark text
 *   ghost   — quiet, hairline-bordered mono action
 *   danger  — red outline that tints on hover
 *
 * Legacy intents (run/solid/outline/approve/reject) are deprecated aliases
 * kept until app call sites migrate; they map onto the three variants.
 */
const button = cva(
  [
    "inline-flex items-center justify-center gap-1.5 font-mono font-semibold tracking-[0.02em]",
    "cursor-pointer rounded-sm whitespace-nowrap transition-colors duration-150",
    focusRingOffset,
    disabledClasses,
  ],
  {
    variants: {
      intent: {
        primary:
          "border border-transparent bg-accent/90 text-accent-contrast hover:bg-accent",
        ghost:
          "border border-border text-foreground-dim bg-transparent " +
          "hover:bg-[rgba(255,255,255,0.05)] hover:text-foreground hover:border-border-strong",
        danger:
          "border border-bad/35 text-bad bg-transparent " +
          "hover:bg-bad/10 hover:text-foreground",
      },
      tone: {
        accent: "",
        ok: "",
        warn: "",
        bad: "",
      },
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-[9px] text-caption",
      },
      block: { true: "w-full", false: "" },
    },
    compoundVariants: [
      { intent: "primary", tone: "ok", className: "bg-ok/90 hover:bg-ok" },
      { intent: "primary", tone: "warn", className: "bg-warn/90 hover:bg-warn" },
      { intent: "primary", tone: "bad", className: "bg-bad/90 hover:bg-bad" },
      { intent: "danger", tone: "warn", className: "border-warn/35 text-warn hover:bg-warn/10" },
    ],
    defaultVariants: { intent: "primary", tone: "accent", size: "md", block: false },
  },
);

/** Spinner border color per intent — primary spins in the contrast color. */
const spinnerClass: Record<"primary" | "ghost" | "danger", string> = {
  primary: "border-accent-contrast/30 border-t-accent-contrast",
  ghost: "border-accent/30 border-t-accent",
  danger: "border-bad/30 border-t-bad",
};

export type ButtonIntent = "primary" | "ghost" | "danger";

/** @deprecated Legacy intent names — use primary/ghost/danger (+ tone). */
export type ButtonLegacyIntent =
  | "run"
  | "solid"
  | "outline"
  | "approve"
  | "reject";

const legacyIntentMap: Record<
  ButtonLegacyIntent,
  { intent: ButtonIntent; tone?: "ok" }
> = {
  run: { intent: "primary" },
  solid: { intent: "primary" },
  outline: { intent: "ghost" },
  approve: { intent: "primary", tone: "ok" },
  reject: { intent: "danger" },
};

export type ButtonSize = "sm" | "md";

/** @deprecated Legacy size names — use sm/md. */
export type ButtonLegacySize = "xs" | "lg";

const legacySizeMap: Record<ButtonLegacySize, ButtonSize> = {
  xs: "sm",
  lg: "md",
};

export enum ButtonTestId {
  Root = "button-root",
  Icon = "button-icon",
  Spinner = "button-spinner",
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">,
    Omit<VariantProps<typeof button>, "intent" | "size"> {
  intent?: ButtonIntent | ButtonLegacyIntent;
  size?: ButtonSize | ButtonLegacySize;
  /** Optional leading icon glyph. */
  icon?: IconName;
  /** Replaces the icon with a spinner and suppresses clicks. */
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

function isLegacyIntent(i: ButtonIntent | ButtonLegacyIntent): i is ButtonLegacyIntent {
  return i in legacyIntentMap;
}

function isLegacySize(s: ButtonSize | ButtonLegacySize): s is ButtonLegacySize {
  return s in legacySizeMap;
}

export function Button({
  intent = "primary",
  tone,
  size = "md",
  block,
  icon,
  loading = false,
  children,
  type = "button",
  disabled,
  onClick,
  ref,
  ...props
}: ButtonProps) {
  const mapped = isLegacyIntent(intent) ? legacyIntentMap[intent] : { intent };
  const resolvedIntent = mapped.intent;
  const resolvedTone = tone ?? mapped.tone;
  const resolvedSize = isLegacySize(size) ? legacySizeMap[size] : size;
  const iconSize = resolvedSize === "sm" ? "xs" : "sm";

  return (
    <button
      aria-busy={loading || undefined}
      className={button({
        intent: resolvedIntent,
        tone: resolvedTone,
        size: resolvedSize,
        block,
      })}
      data-testid={ButtonTestId.Root}
      disabled={disabled}
      onClick={loading ? undefined : onClick}
      ref={ref}
      type={type}
      {...props}
    >
      {loading ? (
        <span
          className={cn(
            "h-3 w-3 shrink-0 rounded-full border-[1.5px] animate-spinner motion-reduce:animate-none",
            spinnerClass[resolvedIntent],
          )}
          data-testid={ButtonTestId.Spinner}
        />
      ) : icon ? (
        <Icon data-testid={ButtonTestId.Icon} name={icon} size={iconSize} stroke="medium" />
      ) : null}
      {children}
    </button>
  );
}
