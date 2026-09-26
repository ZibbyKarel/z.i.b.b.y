import { type ButtonHTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils/cn";
import { disabledClasses, focusRingOffset } from "../../utils/focus";
import { Icon, type IconName } from "../Icon/Icon";

/**
 * The single button system (DS.md §8 Buttons):
 *   primary   — ink fill, panel text
 *   secondary — hairline (`--line2`), quiet text that solidifies on hover
 *   ghost     — borderless, quietest action
 *   danger    — err-toned hairline (never a red fill)
 * `tone` recolors primary/danger with a state color (`LEGACY_TONE_MAP`, e.g.
 * `tone="ok"` → `--s-done`'s purple — the approve = primary + ok pairing).
 */
const button = cva(
  [
    "inline-flex items-center justify-center gap-1.5 font-mono font-semibold uppercase tracking-wider",
    "cursor-pointer rounded-none whitespace-nowrap transition-colors duration-150",
    focusRingOffset,
    disabledClasses,
  ],
  {
    variants: {
      intent: {
        primary: "border border-ink bg-ink text-panel hover:bg-ink/90",
        secondary:
          "border border-line-2 text-ink-2 bg-transparent " +
          "hover:text-ink hover:bg-panel-2 hover:border-ink",
        ghost:
          "border border-transparent text-ink-2 bg-transparent " +
          "hover:text-ink hover:bg-panel-2",
        danger: "border border-bad/35 text-bad bg-transparent " + "hover:bg-bad/10 hover:text-ink",
      },
      tone: {
        accent: "",
        ok: "",
        warn: "",
        bad: "",
      },
      size: {
        sm: "px-[10px] py-[6px] text-[11px]",
        md: "px-[14px] py-[11px] text-[11px]",
      },
      block: { true: "w-full", false: "" },
    },
    compoundVariants: [
      { intent: "primary", tone: "ok", className: "bg-ok hover:bg-ok/90 border-ok" },
      { intent: "primary", tone: "warn", className: "bg-warn hover:bg-warn/90 border-warn" },
      { intent: "primary", tone: "bad", className: "bg-bad hover:bg-bad/90 border-bad" },
      { intent: "danger", tone: "warn", className: "border-warn/35 text-warn hover:bg-warn/10" },
    ],
    defaultVariants: { intent: "primary", tone: "accent", size: "md", block: false },
  },
);

/** Spinner border color per intent — primary spins in the panel-contrast color. */
const spinnerClass: Record<"primary" | "secondary" | "ghost" | "danger", string> = {
  primary: "border-panel/30 border-t-panel",
  secondary: "border-ink-2/30 border-t-ink-2",
  ghost: "border-ink-2/30 border-t-ink-2",
  danger: "border-bad/30 border-t-bad",
};

export type ButtonIntent = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export enum ButtonTestId {
  Root = "button-root",
  Icon = "button-icon",
  Spinner = "button-spinner",
}

export interface ButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">,
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
