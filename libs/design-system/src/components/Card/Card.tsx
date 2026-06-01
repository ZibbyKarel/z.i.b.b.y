import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { Container } from "../Container/Container";
import {
  spacingToPx,
  type Spacing,
  type Padding,
} from "../../tokens";

export enum CardTestId {
  Root = "card-root",
  Header = "card-header",
  Content = "card-content",
  Footer = "card-footer",
}

export type CornersTone = "accent" | "bad" | "ok" | "warn";

const cornersToneClass: Record<CornersTone, string> = {
  accent: "border-accent",
  bad: "border-bad",
  ok: "border-ok",
  warn: "border-warn",
};

export interface CornersProps {
  inset?: Spacing;
  tone?: CornersTone;
}

export function Corners({ inset = "75", tone = "accent" }: CornersProps) {
  const px = spacingToPx(inset);
  const base = cn(
    "pointer-events-none absolute h-3 w-3 opacity-60",
    cornersToneClass[tone],
  );
  return (
    <>
      <span
        className={cn(base, "border-t-[1.5px] border-l-[1.5px]")}
        style={{ top: px, left: px }}
      />
      <span
        className={cn(base, "border-t-[1.5px] border-r-[1.5px]")}
        style={{ top: px, right: px }}
      />
      <span
        className={cn(base, "border-b-[1.5px] border-l-[1.5px]")}
        style={{ bottom: px, left: px }}
      />
      <span
        className={cn(base, "border-b-[1.5px] border-r-[1.5px]")}
        style={{ bottom: px, right: px }}
      />
    </>
  );
}

export interface CardProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "className"
> {
  background?: "elevated" | "raised" | "surface";
  bordered?: boolean;
  interactive?: boolean;
  radius?: "none" | "sm" | "default";
  corners?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

const bgClasses: Record<NonNullable<CardProps["background"]>, string> = {
  elevated: "bg-elevated",
  raised: "bg-raised",
  surface: "bg-surface",
};

const radiusClasses: Record<NonNullable<CardProps["radius"]>, string> = {
  none: "rounded-none",
  sm: "rounded-sm",
  default: "rounded",
};

export function Card({
  background = "elevated",
  bordered = true,
  interactive = false,
  radius = "default",
  corners = false,
  header,
  footer,
  children,
  ref,
  ...rest
}: CardProps) {
  return (
    <div
      data-testid={CardTestId.Root}
      {...rest}
      ref={ref}
      className={cn(
        "relative group",
        bgClasses[background],
        radiusClasses[radius],
        bordered && "border border-border",
        interactive &&
          "transition-colors hover:border-accent/40 hover:bg-raised",
      )}
    >
      {corners && <Corners inset="75" />}
      {header && <CardHeader>{header}</CardHeader>}
      {children}
      {footer && <CardFooter>{footer}</CardFooter>}
    </div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return (
    <div data-testid={CardTestId.Header} className="px-[14px] py-3 border-b border-border font-mono font-semibold text-base tracking-wide text-foreground-dim">
      {children}
    </div>
  );
}

export function CardContent({
  children,
  padding = "200",
}: {
  children: ReactNode;
  padding?: Padding;
}) {
  return <Container data-testid={CardTestId.Content} padding={padding}>{children}</Container>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div data-testid={CardTestId.Footer} className="px-[14px] py-[10px] border-t border-border flex items-center gap-2">
      {children}
    </div>
  );
}

export function CardActions({ children }: { children: ReactNode }) {
  return <CardFooter>{children}</CardFooter>;
}
