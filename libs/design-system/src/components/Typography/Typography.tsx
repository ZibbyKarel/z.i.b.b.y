"use client";
import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { useTokens } from "../../DesignSystemContext/hooks";

/**
 * Typography — the single semantic type component for the app and DS.
 *
 * Five semantic roles (`type`) × three color variants (`variant`), mapped onto
 * the HUD type scale + design tokens. App and DS code render text exclusively
 * through `Typography`.
 */
export type TypographyType =
  | "pageTitle"
  | "title"
  | "subtitle"
  | "text"
  | "note";

export type TypographyVariant = "primary" | "secondary" | "tertiary";

export enum TypographyTestId {
  Root = "typography-root",
}

type As = "h1" | "h2" | "h3" | "div" | "p" | "span";

export interface TypographyProps extends HTMLAttributes<HTMLElement> {
  type: TypographyType;
  variant?: TypographyVariant;
  ref?: Ref<HTMLElement>;
}

/** Semantic role → element. Mirrors the heading outline of a page. */
const typeToTag: Record<TypographyType, As> = {
  pageTitle: "h1",
  title: "h2",
  subtitle: "h3",
  text: "div",
  note: "div",
};

/** Semantic role → HUD type scale (27/20/17/14/12px) + matching line-height. */
const typeToFont: Record<
  TypographyType,
  { fontSize: string; lineHeight: string }
> = {
  pageTitle: { fontSize: "1.6875rem", lineHeight: "1.2" },
  title: { fontSize: "1.25rem", lineHeight: "1.25" },
  subtitle: { fontSize: "1.0625rem", lineHeight: "1.3" },
  text: { fontSize: "0.875rem", lineHeight: "1.4" },
  note: { fontSize: "0.75rem", lineHeight: "1.5" },
};

const typeToWeight: Record<TypographyType, number> = {
  pageTitle: 700,
  title: 600,
  subtitle: 500,
  text: 400,
  note: 400,
};

export function Typography({
  type,
  variant = "primary",
  style,
  ref,
  ...rest
}: TypographyProps) {
  const tokens = useTokens();

  // Resolve color explicitly (not via inheritance) so a `primary` heading looks
  // identical inside the app and in Storybook, where no ancestor sets a color.
  const variantToColor: Record<TypographyVariant, string> = {
    primary: tokens.color.text.primary,
    secondary: tokens.color.text.secondary,
    tertiary: tokens.color.text.tertiary,
  };

  const Element = typeToTag[type];
  const computedStyle: CSSProperties = {
    fontSize: typeToFont[type].fontSize,
    lineHeight: typeToFont[type].lineHeight,
    fontWeight: typeToWeight[type],
    color: variantToColor[variant],
    ...style,
  };

  return (
    <Element
      data-testid={TypographyTestId.Root}
      style={computedStyle}
      ref={
        ref as Ref<
          HTMLHeadingElement &
            HTMLDivElement &
            HTMLParagraphElement &
            HTMLSpanElement
        >
      }
      {...rest}
    />
  );
}
