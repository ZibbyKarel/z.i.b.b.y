import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { Container } from "../Container/Container";
import { Row } from "../Stack/Stack";
import {
  type Padding,
  type Spacing,
  spacingToPx,
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
  background?: "elevated" | "raised" | "surface" | "panel" | "glass" | "background";
  bordered?: boolean;
  borderStyle?: "solid" | "dashed";
  interactive?: boolean;
  radius?: "none" | "sm" | "default";
  shadow?: "none" | "card" | "dropdown" | "modal";
  animate?: "none" | "fade" | "scale";
  corners?: boolean;
  /** Toned emphasis: colours the border, corners and adds a faint ring glow. */
  tone?: "accent" | "ok" | "warn" | "bad";
  /** Render as a selectable button (forwards onClick / aria-pressed). */
  as?: "div" | "button";
  /** Highlighted selected state (accent border + ring). */
  selected?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

const bgClasses: Record<NonNullable<CardProps["background"]>, string> = {
  elevated: "bg-elevated",
  raised: "bg-raised",
  surface: "bg-surface",
  panel: "bg-surface-panel",
  glass: "bg-surface-glass",
  background: "bg-background",
};

const radiusClasses: Record<NonNullable<CardProps["radius"]>, string> = {
  none: "rounded-none",
  sm: "rounded-sm",
  default: "rounded",
};

const shadowClasses: Record<NonNullable<CardProps["shadow"]>, string> = {
  none: "",
  card: "shadow-card",
  dropdown: "shadow-dropdown",
  modal: "shadow-modal",
};

const animateClasses: Record<NonNullable<CardProps["animate"]>, string> = {
  none: "",
  fade: "animate-fade-in",
  scale: "animate-scale-in",
};

const toneBorder: Record<NonNullable<CardProps["tone"]>, string> = {
  accent: "border-accent/30",
  ok: "border-ok/30",
  warn: "border-warn/30",
  bad: "border-bad/30",
};

const toneGlow: Record<NonNullable<CardProps["tone"]>, string> = {
  accent: "shadow-[0_0_0_1px_rgba(240,180,41,0.12)]",
  ok: "shadow-[0_0_0_1px_rgba(57,217,138,0.12)]",
  warn: "shadow-[0_0_0_1px_rgba(240,180,41,0.12)]",
  bad: "shadow-[0_0_0_1px_rgba(255,107,107,0.12)]",
};

export function Card({
  background = "elevated",
  bordered = true,
  borderStyle = "solid",
  interactive = false,
  radius = "default",
  shadow = "none",
  animate = "none",
  corners = false,
  tone,
  as: Tag = "div",
  selected = false,
  header,
  footer,
  children,
  ref,
  ...rest
}: CardProps) {
  return (
    <Tag
      data-testid={CardTestId.Root}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(rest as any)}
      className={cn(
        "relative group",
        bgClasses[background],
        radiusClasses[radius],
        shadowClasses[shadow],
        animateClasses[animate],
        bordered && (tone ? toneBorder[tone] : "border border-border"),
        bordered && tone && "border",
        tone && toneGlow[tone],
        borderStyle === "dashed" && "border-dashed",
        Tag === "button" &&
          "w-full text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent",
        interactive &&
          "transition-colors hover:border-accent/40 hover:bg-raised",
        selected && "border-accent bg-raised shadow-[0_0_0_1px_var(--color-accent-dim)]",
      )}
      ref={ref as Ref<HTMLDivElement & HTMLButtonElement>}
    >
      {corners && <Corners inset="75" tone={tone ?? "accent"} />}
      {header && <CardHeader>{header}</CardHeader>}
      {children}
      {footer && <CardFooter>{footer}</CardFooter>}
    </Tag>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-[14px] py-3 border-b border-border font-mono font-semibold text-base tracking-wide text-foreground-dim" data-testid={CardTestId.Header}>
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
    <div className="px-[14px] py-[10px] border-t border-border" data-testid={CardTestId.Footer}>
      <Row gap="100">{children}</Row>
    </div>
  );
}

export function CardActions({ children }: { children: ReactNode }) {
  return <CardFooter>{children}</CardFooter>;
}
