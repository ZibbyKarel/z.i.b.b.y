import type { ReactNode } from "react";

/**
 * The ZIBBY top-hat (cylindr) butler mark.
 * Authored in a 32×32 grid, scaled into the shared 24×24 icon viewBox.
 */
export const butlerSign: ReactNode = (
  <g transform="scale(0.75)">
    <ellipse cx="16" cy="25" fill="currentColor" opacity="0.18" rx="12" ry="2.4" stroke="none" />
    <path d="M9 24h14" strokeWidth="2" />
    <path d="M11 24V11a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v13" fill="none" strokeWidth="2" />
    <path d="M11 19h10" strokeWidth="2" />
  </g>
);
