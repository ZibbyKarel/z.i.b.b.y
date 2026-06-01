import type { SVGProps } from "react";
import { paths, iconNames } from "../../assets/icons";
import type { IconName } from "../../assets/icons";

// Icon set (glyphy + registr) žije v `../icons`. Re-export zachovává veřejné API
// `Icon`, `iconNames`, `IconName` z tohoto modulu.
export { iconNames };
export type { IconName };

export interface IconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "name" | "stroke"
> {
  /** Which glyph to render. */
  name: IconName;
  /** Square size in px. */
  size?: number;
  /** Stroke width. */
  stroke?: number;
  ref?: React.Ref<SVGSVGElement>;
}

/** Inline stroke icon, 1.6 default stroke, inherits `currentColor`. */
export function Icon({
  name,
  size = 18,
  stroke = 1.6,
  ref,
  ...props
}: IconProps) {
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
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
