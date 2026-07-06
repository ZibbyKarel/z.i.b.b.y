import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Container } from "../Container/Container";
import { Row } from "../Stack/Stack";
import { type Padding, type Spacing, spacingToPx } from "../../tokens";
import type { StateTone } from "../../stateTone";

export enum CardTestId {
  Root = "card-root",
  Header = "card-header",
  Content = "card-content",
  Footer = "card-footer",
}

/** The HUD bracket tone — the canonical {@link StateTone} vocabulary. */
export type CornersTone = StateTone;

const cornersToneClass: Record<CornersTone, string> = {
  accent: "border-accent",
  bad: "border-bad",
  ok: "border-ok",
  warn: "border-warn",
  run: "border-run",
};

export interface CornersProps {
  inset?: Spacing;
  tone?: CornersTone;
}

/** HUD bracket marks — the signature of a live panel; never decorative. */
export function Corners({ inset = "75", tone = "accent" }: CornersProps) {
  const px = spacingToPx(inset);
  const base = cn("pointer-events-none absolute h-2.5 w-2.5 opacity-55", cornersToneClass[tone]);
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

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  background?: "elevated" | "raised" | "surface" | "panel" | "glass" | "background";
  bordered?: boolean;
  borderStyle?: "solid" | "dashed";
  /** One step above surface — elevated background, strong border, elevation shadow.
   *  A shorthand that wins over `background`/`shadow`. */
  elevated?: boolean;
  /** Clip content to the card radius (`overflow-hidden`) — for edge-to-edge bodies. */
  clip?: boolean;
  interactive?: boolean;
  radius?: "none" | "sm" | "default" | "lg";
  shadow?: "none" | "card" | "dropdown" | "modal";
  animate?: "none" | "fade" | "scale";
  corners?: boolean;
  /** Toned emphasis: colours the border, corners and adds a faint ring glow. */
  tone?: StateTone;
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
  lg: "rounded-lg",
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
  run: "border-run/30",
};

const toneGlow: Record<NonNullable<CardProps["tone"]>, string> = {
  accent: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]",
  ok: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-ok)_12%,transparent)]",
  warn: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-warn)_12%,transparent)]",
  bad: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-bad)_12%,transparent)]",
  run: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-run)_12%,transparent)]",
};

export function Card({
  background = "surface",
  bordered = true,
  borderStyle = "solid",
  elevated = false,
  clip = false,
  interactive = false,
  radius = "lg",
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
        elevated ? "bg-elevated" : bgClasses[background],
        radiusClasses[radius],
        elevated ? "shadow-[var(--shadow-elevated)]" : shadowClasses[shadow],
        animateClasses[animate],
        clip && "overflow-hidden",
        bordered &&
          (tone
            ? toneBorder[tone]
            : elevated
              ? "border border-border-strong"
              : "border border-border"),
        bordered && tone && "border",
        tone && toneGlow[tone],
        borderStyle === "dashed" && "border-dashed",
        Tag === "button" && cn("w-full text-left cursor-pointer", focusRing),
        interactive &&
          "transition-all duration-150 hover:border-accent/35 hover:bg-elevated hover:shadow-card",
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
    <div
      className="px-[14px] py-3 border-b border-border font-mono font-semibold text-base tracking-wide text-foreground-dim"
      data-testid={CardTestId.Header}
    >
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
  return (
    <Container data-testid={CardTestId.Content} padding={padding}>
      {children}
    </Container>
  );
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
