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
 * `tone` recolors primary/danger (e.g. the green approve = primary + ok).
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
export type ButtonSize = "sm" | "md";

export enum ButtonTestId {
  Root = "button-root",
  Icon = "button-icon",
  Spinner = "button-spinner",
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">,
    Omit<VariantProps<typeof button>, "intent" | "size"> {
  intent?: ButtonIntent;
  size?: ButtonSize;
  /** Optional leading icon glyph. */
  icon?: IconName;
  /** Replaces the icon with a spinner and suppresses clicks. */
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
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
  const iconSize = size === "sm" ? "xs" : "sm";

  return (
    <button
      aria-busy={loading || undefined}
      className={button({ intent, tone, size, block })}
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
            spinnerClass[intent],
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
