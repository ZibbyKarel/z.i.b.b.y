"use client";
import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { useTokens } from "../../DesignSystemContext/hooks";

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  ref?: Ref<HTMLElement>;
}

export function Kbd({ style, ref, children, ...rest }: KbdProps) {
  const tokens = useTokens();
  const computedStyle: CSSProperties = {
    display:         "inline-flex",
    alignItems:      "center",
    justifyContent:  "center",
    minWidth:        "18px",
    height:          "18px",
    padding:         "0 5px",
    fontFamily:      tokens.font.mono,
    fontSize:        "0.5625rem",
    fontWeight:      500,
    lineHeight:      1,
    color:           tokens.color.text.secondary,
    backgroundColor: tokens.color.bg.raised,
    borderWidth:     "1px",
    borderStyle:     "solid",
    borderColor:     tokens.color.border.strong,
    borderRadius:    tokens.size.radiusSm,
    boxShadow:       `0 1px 0 ${tokens.color.border.strong}`,
    ...style,
  };
  return (
    <kbd {...rest} ref={ref as Ref<HTMLElement>} style={computedStyle}>
      {children}
    </kbd>
  );
}
