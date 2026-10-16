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
 * The ZibbyCorp company logo — an ink crest with a panel-coloured notch and
 * "Z" cut-out. Ink and cut-out follow the `--color-ink` / `--color-panel`
 * tokens, so it themes with light/dark. Static favicons in `apps/web/app` are
 * rendered from the same geometry.
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
      <polygon fill="var(--color-ink)" points="1,3 11,8.5 16,1 21,8.5 31,3 27,18 16,31 5,18" />
      <polygon fill="var(--color-panel)" points="16,5.5 18.5,10 13.5,10" />
      <path
        d="M10.5 12.5H21.5L11.5 22H21.5"
        fill="none"
        stroke="var(--color-panel)"
        strokeLinejoin="miter"
        strokeMiterlimit={10}
        strokeWidth={2.6}
      />
    </svg>
  );
}
