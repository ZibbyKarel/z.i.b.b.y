import type { CSSProperties } from "react";
import { spacingToPx, type Spacing } from "../../tokens";

export interface SpacerProps {
  size?: Spacing;
  axis?: "x" | "y" | "both";
  grow?: boolean;
}

export function Spacer({ size, axis = "both", grow }: SpacerProps) {
  const px = size !== undefined ? spacingToPx(size) : undefined;

  const style: CSSProperties = {
    display:     "block",
    flexGrow:    grow ? 1 : undefined,
    width:       axis === "y" ? undefined : (px ?? (grow ? undefined : "0")),
    height:      axis === "x" ? undefined : (px ?? (grow ? undefined : "0")),
    minWidth:    axis === "y" ? undefined : px,
    minHeight:   axis === "x" ? undefined : px,
    flexShrink:  0,
    pointerEvents: "none",
  };

  return <span aria-hidden style={style} />;
}
