import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../lib/cn";

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

export interface TypographyProps extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  type: TypographyType;
  variant?: TypographyVariant;
  ref?: Ref<HTMLElement>;
}

const typeToTag: Record<TypographyType, As> = {
  pageTitle: "h1",
  title:     "h2",
  subtitle:  "h3",
  text:      "div",
  note:      "div",
};

const typeClasses: Record<TypographyType, string> = {
  pageTitle: "text-5xl font-bold leading-[1.2]",
  title:     "text-3xl font-semibold leading-[1.25]",
  subtitle:  "text-2xl font-medium leading-[1.3]",
  text:      "text-lg font-normal leading-[1.4]",
  note:      "text-base font-normal leading-[1.5]",
};

const variantClasses: Record<TypographyVariant, string> = {
  primary:   "text-foreground",
  secondary: "text-foreground-dim",
  tertiary:  "text-foreground-faint",
};

export function Typography({
  type,
  variant = "primary",
  ref,
  ...rest
}: TypographyProps) {
  const Element = typeToTag[type];
  return (
    <Element
      data-testid={TypographyTestId.Root}
      ref={
        ref as Ref<
          HTMLHeadingElement &
            HTMLDivElement &
            HTMLParagraphElement &
            HTMLSpanElement
        >
      }
      className={cn(typeClasses[type], variantClasses[variant])}
      {...rest}
    />
  );
}
