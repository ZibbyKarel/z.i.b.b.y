import type { CSSProperties, ElementType, HTMLAttributes, Ref } from "react";
import { type Spacing, spacingToPx } from "../../tokens";

export enum StackTestId {
  Root = "stack-root",
}

export interface StackProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "className"
> {
  direction?: "row" | "col";
  gap?: Spacing;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between" | "around";
  wrap?: boolean;
  inline?: boolean;
  grow?: boolean;
  shrink?: boolean;
  as?:
    | "div"
    | "section"
    | "ul"
    | "ol"
    | "li"
    | "nav"
    | "span"
    | "form"
    | "header"
    | "footer";
  ref?: Ref<HTMLElement>;
}

const alignMap: Record<NonNullable<StackProps["align"]>, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
};

const justifyMap: Record<NonNullable<StackProps["justify"]>, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
};

export function Stack({
  direction = "col",
  gap,
  align,
  justify,
  wrap,
  inline,
  grow,
  shrink,
  as: Tag = "div",
  style,
  ref,
  ...rest
}: StackProps) {
  const computedStyle: CSSProperties = {
    display: inline ? "inline-flex" : "flex",
    flexDirection: direction === "row" ? "row" : "column",
    gap: gap !== undefined ? spacingToPx(gap) : undefined,
    alignItems: align ? alignMap[align] : undefined,
    justifyContent: justify ? justifyMap[justify] : undefined,
    flexWrap: wrap ? "wrap" : undefined,
    flexGrow: grow ? 1 : undefined,
    flexShrink: shrink === false ? 0 : undefined,
    ...style,
  };

   
  const Component = Tag as ElementType;
  return (
    <Component
      data-testid={StackTestId.Root}
      {...rest}
      ref={ref}
      style={computedStyle}
    />
  );
}

export interface RowProps extends Omit<StackProps, "direction"> {
  ref?: Ref<HTMLElement>;
}

/** Horizontal Stack — shorthand for <Stack direction="row" align="center"> */
export function Row({ align = "center", ref, ...props }: RowProps) {
  return <Stack align={align} direction="row" ref={ref} {...props} />;
}
