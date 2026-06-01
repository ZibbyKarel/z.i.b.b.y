"use client";
import type { CSSProperties } from "react";
import { useTokens } from "../../DesignSystemContext/hooks";

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function Divider({ orientation = "horizontal", className }: DividerProps) {
  const tokens = useTokens();

  const style: CSSProperties =
    orientation === "vertical"
      ? { width: "1px", alignSelf: "stretch", backgroundColor: tokens.color.border.default }
      : { height: "1px", width: "100%", backgroundColor: tokens.color.border.default };

  return <span aria-hidden role="separator" className={className} style={style} />;
}
