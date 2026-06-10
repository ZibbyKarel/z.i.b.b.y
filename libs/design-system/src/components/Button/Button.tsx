import { type ButtonHTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { disabledClasses, focusRingOffset } from "../../utils/focus";
import { Icon, type IconName } from "../Icon/Icon";

/**
 * The dashboard button. A single CVA owns every flavour the dashboard needs:
 *   run     — outline accent that fills on hover (the recurring "čudlík")
 *   solid   — filled accent
 *   ghost   — quiet, hairline-bordered mono action
 *   outline — quiet top-bar action that turns accent on hover (voice, new task)
 *   approve — green guardrail confirm
 *   reject  — red guardrail decline
 */
const button = cva(
  [
    "inline-flex items-center justify-center gap-1.5 font-mono font-semibold cursor-pointer rounded-sm transition-all",
    focusRingOffset,
    disabledClasses,
  ],
  {
    variants: {
      intent: {
        run:
          "border border-accent text-accent bg-transparent " +
          "hover:bg-accent hover:text-accent-contrast hover:shadow-glow-accent",
        solid:
          "border border-accent bg-accent text-accent-contrast hover:shadow-glow-accent",
        ghost:
          "border border-border text-foreground-dim bg-transparent " +
          "hover:bg-[rgba(255,255,255,0.05)] hover:text-foreground",
        outline:
          "border border-border text-foreground-dim bg-transparent tracking-wider " +
          "hover:border-accent hover:bg-accent-dim hover:text-accent",
        approve:
          "border-none bg-ok text-background shadow-[0_0_14px_color-mix(in_srgb,var(--color-ok)_27%,transparent)] " +
          "hover:brightness-110",
        reject: "border border-bad/40 text-bad bg-transparent hover:bg-bad/10",
      },
      size: {
        xs: "px-3 py-1.5 text-xs",
        sm: "px-3 py-1.5 text-base",
        md: "px-4 py-2 text-base",
        lg: "px-6 py-2.5 text-md",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { intent: "run", size: "md", block: false },
  },
);

export enum ButtonTestId {
  Root = "button-root",
  Icon = "button-icon",
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">, VariantProps<typeof button> {
  /** Optional leading icon glyph. */
  icon?: IconName;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({
  intent,
  size,
  block,
  icon,
  children,
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  const iconSize = size === "lg" ? "sm" : "xs";
  return (
    <button
      className={button({ intent, size, block })}
      data-testid={ButtonTestId.Root}
      ref={ref}
      type={type}
      {...props}
    >
      {icon ? <Icon data-testid={ButtonTestId.Icon} name={icon} size={iconSize} stroke="medium" /> : null}
      {children}
    </button>
  );
}
