/* eslint-disable react/forbid-dom-props -- Corner bracket uses brand-specific inline styles with no DS prop equivalent. */
import type { CSSProperties } from "react";

export function Corner({ style }: { style: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed h-10 w-10 opacity-25"
      style={style}
    />
  );
}
