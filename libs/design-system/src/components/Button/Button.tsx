import { type ButtonHTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils/cn";
import { disabledClasses, focusRingOffset } from "../../utils/focus";
import { Icon, type IconName } from "../Icon/Icon";
import { StatusDot } from "../StatusDot/StatusDot";

/**
 * The single button system (DS.md §8 Buttons) — radius 0, 1px border, mono
 * UPPERCASE label (`label` 11px / `label-sm` 10px, 0.14em, weight 400):
 *   primary   — ink fill, panel text
 *   secondary — `--line2` hairline, `--ink2` text → hover `--ink` on `--panel2`
 *   ghost     — secondary without the hairline (quietest action; no DS.md row)
 *   danger    — DS.md "Destructive": secondary + a leading `--s-err` dot, never a red fill
 * An icon-only button (no children) is DS.md's "Icon / arrow": 9px side padding.
 */
const button = cva(
  [
    "inline-flex items-center justify-center gap-1.5 border font-mono font-normal uppercase tracking-wider",
    "cursor-pointer rounded-none whitespace-nowrap transition-colors duration-150",
    focusRingOffset,
    disabledClasses,
  ],
  {
    variants: {
      intent: {
        primary: "border-ink bg-ink text-panel hover:bg-ink/90",
        secondary: "border-line-2 bg-transparent text-ink-2 hover:bg-panel-2 hover:text-ink",
        ghost: "border-transparent bg-transparent text-ink-2 hover:bg-panel-2 hover:text-ink",
        danger: "border-line-2 bg-transparent text-ink-2 hover:bg-panel-2 hover:text-ink",
      },
      size: {
        // sm = DS.md 6px / 10px; md = the run-detail header button (10×14, 11px).
        sm: "px-[10px] py-[6px] text-[10px]",
        md: "px-[14px] py-[10px] text-[11px]",
      },
      iconOnly: { true: "px-[9px]", false: "" },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { intent: "primary", size: "md", iconOnly: false, block: false },
  },
);

/** Spinner border color per intent — primary spins in the panel-contrast color. */
const spinnerClass: Record<ButtonIntent, string> = {
  primary: "border-panel/30 border-t-panel",
  secondary: "border-ink-2/30 border-t-ink-2",
  ghost: "border-ink-2/30 border-t-ink-2",
  danger: "border-ink-2/30 border-t-ink-2",
};

export type ButtonIntent = "primary" | "secondary" | "ghost" | "danger";
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
