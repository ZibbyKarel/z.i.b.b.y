import { type ButtonHTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils/cn";
import { disabledClasses, focusRingOffset } from "../../utils/focus";
import { Icon, type IconName } from "../Icon/Icon";
import { StatusDot } from "../StatusDot/StatusDot";

/**
 * The single button system (Zibby 2.0 design) — 8px radius, 1px border, sans
 * sentence-case label, weight 500:
 *   primary   — brand accent fill, accent-contrast text ("Run all")
 *   secondary — `--line2` hairline, `--ink2` text → hover `--ink` on hover bg ("Add task")
 *   outline   — `--ink` hairline, `--ink` text (the Bridge EDIT LAYOUT toggle; DONE is `primary`)
 *   ghost     — secondary without the hairline (quietest action)
 *   danger    — secondary + a leading `--s-err` dot, never a red fill
 * An icon-only button (no children): 9px side padding.
 */
const button = cva(
  [
    "inline-flex items-center justify-center gap-1.5 border font-sans font-medium",
    "cursor-pointer rounded-md whitespace-nowrap transition-colors duration-150",
    focusRingOffset,
    disabledClasses,
  ],
  {
    variants: {
      intent: {
        primary: "border-accent bg-accent text-accent-contrast hover:bg-accent/90",
        secondary: "border-line-2 bg-panel text-ink-2 hover:bg-hover hover:text-ink",
        outline: "border-ink bg-transparent text-ink hover:bg-hover",
        ghost: "border-transparent bg-transparent text-ink-2 hover:bg-hover hover:text-ink",
        danger: "border-line-2 bg-panel text-ink-2 hover:bg-hover hover:text-ink",
      },
      size: {
        sm: "px-[10px] py-[5px] text-[12px]",
        md: "px-[12px] py-[7px] text-[13px]",
      },
      iconOnly: { true: "px-[9px]", false: "" },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { intent: "primary", size: "md", iconOnly: false, block: false },
  },
);

/** The button class recipe, shared with `HoldButton` so both stay one look. Not public. */
export const buttonClasses = button;

/** Spinner border color per intent — primary spins in the panel-contrast color. */
const spinnerClass: Record<ButtonIntent, string> = {
  primary: "border-accent-contrast/30 border-t-accent-contrast",
  secondary: "border-ink-2/30 border-t-ink-2",
  outline: "border-ink/30 border-t-ink",
  ghost: "border-ink-2/30 border-t-ink-2",
  danger: "border-ink-2/30 border-t-ink-2",
};

export type ButtonIntent = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export enum ButtonTestId {
  Root = "button-root",
  Icon = "button-icon",
  Spinner = "button-spinner",
  /** The `--s-err` dot a `danger` button leads with. */
  Dot = "button-dot",
}

export interface ButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">,
    Omit<VariantProps<typeof button>, "intent" | "size" | "iconOnly"> {
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
      className={button({ intent, size, block, iconOnly: children == null })}
      data-testid={ButtonTestId.Root}
      disabled={disabled}
      onClick={loading ? undefined : onClick}
      ref={ref}
      type={type}
      {...props}
    >
      {intent === "danger" && (
        <StatusDot aria-hidden data-testid={ButtonTestId.Dot} size="75" tone="error" />
      )}
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
