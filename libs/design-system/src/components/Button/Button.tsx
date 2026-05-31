import { type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "../Icon/Icon";

/**
 * The dashboard button. A single CVA owns every flavour the dashboard needs:
 *   run     — outline accent that fills on hover (the recurring "čudlík")
 *   solid   — filled accent
 *   ghost   — quiet, hairline-bordered mono action
 *   approve — green guardrail confirm
 *   reject  — red guardrail decline
 */
const button = cva(
  "inline-flex items-center justify-center gap-1.5 font-mono font-semibold " +
    "cursor-pointer rounded-sm transition-all outline-none " +
    "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-surface-1 disabled:cursor-not-allowed disabled:opacity-50",
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
        approve:
          "border-none bg-ok text-surface-0 shadow-[0_0_14px_rgba(57,217,138,0.27)] " +
          "hover:brightness-110",
        reject: "border border-bad/40 text-bad bg-transparent hover:bg-bad/10",
      },
      size: {
        sm: "px-3 py-1.5 text-base",
        md: "px-4 py-2 text-base",
        lg: "px-6 py-2.5 text-md",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { intent: "run", size: "md", block: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  /** Optional leading icon glyph. */
  icon?: IconName;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({
  intent,
  size,
  block,
  icon,
  className,
  children,
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  const iconSize = size === "lg" ? 14 : 12;
  return (
    <button
      ref={ref}
      type={type}
      className={cn(button({ intent, size, block }), className)}
      {...props}
    >
      {icon ? <Icon name={icon} size={iconSize} stroke={2} /> : null}
      {children}
    </button>
  );
}
