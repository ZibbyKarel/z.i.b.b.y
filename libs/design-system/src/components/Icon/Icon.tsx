import type { SVGProps } from "react";
import { cn } from "../../utils/cn";
import { iconNames, paths } from "../../assets/icons";
import type { IconName } from "../../assets/icons";
import type { Size } from "../../tokens";

export { iconNames };
export type { IconName };

export type IconStroke = "thin" | "default" | "medium" | "bold";

export type IconTone =
  | "ok"
  | "bad"
  | "warn"
  | "accent"
  | "work"
  | "dim"
  | "faint";

const toneClass: Record<IconTone, string> = {
  ok: "text-ok",
  bad: "text-bad",
  warn: "text-warn",
  accent: "text-accent",
  work: "text-work",
  dim: "text-foreground-dim",
  faint: "text-foreground-faint",
};

export enum IconTestId {
  Root = "icon-root",
}

const iconSizePx: Record<Size, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
};

const strokeWidthPx: Record<IconStroke, number> = {
  thin: 1.2,
  default: 1.6,
  medium: 2,
  bold: 2.4,
};

export interface IconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "name" | "stroke" | "width" | "height" | "strokeWidth"
> {
  /** Which glyph to render. */
  name: IconName;
  /** Semantic size token. */
  size?: Size;
  /** Stroke weight. */
  stroke?: IconStroke;
  /** Semantic colour; defaults to inheriting `currentColor`. */
  tone?: IconTone;
  ref?: React.Ref<SVGSVGElement>;
}

/** Inline stroke icon, inherits `currentColor`. */
export function Icon({
  name,
  size = "md",
  stroke = "default",
  tone,
  className,
  ref,
  ...props
}: IconProps) {
  const px = iconSizePx[size];
  return (
    <svg
      aria-hidden="true"
      className={cn("block shrink-0", tone && toneClass[tone], className)}
      data-testid={IconTestId.Root}
      fill="none"
      height={px}
      ref={ref}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidthPx[stroke]}
      viewBox="0 0 24 24"
      width={px}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
