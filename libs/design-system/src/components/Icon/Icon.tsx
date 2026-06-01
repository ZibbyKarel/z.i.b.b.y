import type { SVGProps } from "react";
import { paths, iconNames } from "../../assets/icons";
import type { IconName } from "../../assets/icons";
import type { Size } from "../../tokens";

export { iconNames };
export type { IconName };

export type IconStroke = "thin" | "default" | "medium" | "bold";

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
  ref?: React.Ref<SVGSVGElement>;
}

/** Inline stroke icon, inherits `currentColor`. */
export function Icon({
  name,
  size = "md",
  stroke = "default",
  ref,
  ...props
}: IconProps) {
  const px = iconSizePx[size];
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      width={px}
      height={px}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidthPx[stroke]}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block shrink-0"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
