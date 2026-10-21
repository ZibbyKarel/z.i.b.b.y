import type { CSSProperties } from "react";
import { type Spacing, spacingToVar } from "../../tokens";

export enum SpacerTestId {
  Root = "spacer-root",
}

export interface SpacerProps {
  size?: Spacing;
  axis?: "x" | "y" | "both";
  grow?: boolean;
}

export function Spacer({ size, axis = "both", grow }: SpacerProps) {
  const px = size !== undefined ? spacingToVar(size) : undefined;

  const style: CSSProperties = {
    display: "block",
    flexGrow: grow ? 1 : undefined,
    width: axis === "y" ? undefined : (px ?? (grow ? undefined : "0")),
    height: axis === "x" ? undefined : (px ?? (grow ? undefined : "0")),
    minWidth: axis === "y" ? undefined : px,
    minHeight: axis === "x" ? undefined : px,
    flexShrink: 0,
    pointerEvents: "none",
  };

  return <span aria-hidden data-testid={SpacerTestId.Root} style={style} />;
}
