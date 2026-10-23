import type { Ref } from "react";

export enum BrandMarkTestId {
  Root = "brand-mark-root",
}

/** The sanctioned render sizes (sealed sizing), in px. */
export type BrandMarkSize = 16 | 24 | 30 | 64;

export interface BrandMarkProps {
  /** Render size in px. Defaults to 30 (the app-header size). */
  size?: BrandMarkSize;
  /** Accessible name. Omit when the mark sits beside the wordmark — it is then
   *  decorative and hidden from assistive tech. */
  label?: string;
  ref?: Ref<SVGSVGElement>;
}

/**
 * The Zibby 2.0 logo — an ink rounded tile (the dashboard's 10px card radius at
 * 32px scale) with a "Z" cut out in the panel colour and its diagonal stroked in
 * the amber brand accent. Ink, cut-out and accent follow the `--color-ink` /
 * `--color-panel` / `--color-accent` tokens, so it themes with light/dark.
 * Static favicons in `apps/web/app` are rendered from the same geometry.
 */
export function BrandMark({ size = 30, label, ref }: BrandMarkProps) {
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      data-testid={BrandMarkTestId.Root}
      focusable="false"
      height={size}
      ref={ref}
      role={label ? "img" : undefined}
      viewBox="0 0 32 32"
      width={size}
    >
      <rect fill="var(--color-ink)" height="32" rx="8" width="32" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.2}>
        <path d="M21.5 10.5L10.5 21.5" stroke="var(--color-accent)" />
        <path d="M10.5 10.5H21.5M10.5 21.5H21.5" stroke="var(--color-panel)" />
      </g>
    </svg>
  );
}
