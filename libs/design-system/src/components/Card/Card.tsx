import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Container } from "../Container/Container";
import { Row } from "../Stack/Stack";
import { type Padding, type Spacing, spacingToPx } from "../../tokens";
import { type AnyStateTone, type StateTone, normalizeStateTone } from "../../stateTone";
import { LivingGlow } from "../LivingGlow/LivingGlow";

export enum CardTestId {
  Root = "card-root",
  Header = "card-header",
  Content = "card-content",
  Footer = "card-footer",
  Edge = "card-edge",
  Corner = "card-corner",
}

/** The bracket tone — accepts both the canonical vocabulary and the legacy one
 *  (see {@link AnyStateTone}); resolved via {@link normalizeStateTone}. */
export type CornersTone = AnyStateTone;

/** Keyed by the canonical `StateTone` — legacy classes reused where the color is
 * identical (LEGACY_TONE_MAP): thinking→accent, blocked→warn, error→bad, done→ok,
 * working→run. `idle` renders in plain `--ink` (DS.md §6) — the generic framing
 * device for a focus object with no particular live state, not a dimmed tone. */
const cornersToneClass: Record<StateTone, string> = {
  thinking: "border-accent",
  blocked: "border-warn",
  error: "border-bad",
  done: "border-ok",
  working: "border-run",
  idle: "border-ink",
};

export interface CornersProps {
  inset?: Spacing;
  tone?: CornersTone;
}

/**
 * DS.md §6 corner brackets — four 8–10px L-shaped marks, `1px solid --ink` by
 * default, tone-tinted only for genuinely live objects (a running task's hero,
 * a `Panel live`). The signature framing device for a focus object.
 */
export function Corners({ inset = "100", tone = "idle" }: CornersProps) {
  const px = spacingToPx(inset);
  const resolvedTone = normalizeStateTone(tone);
  const base = cn("pointer-events-none absolute h-2 w-2", cornersToneClass[resolvedTone]);
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(base, "border-t border-l")}
        data-testid={CardTestId.Corner}
        style={{ top: px, left: px }}
      />
      <span
        aria-hidden="true"
        className={cn(base, "border-t border-r")}
        data-testid={CardTestId.Corner}
        style={{ top: px, right: px }}
      />
      <span
        aria-hidden="true"
        className={cn(base, "border-b border-l")}
        data-testid={CardTestId.Corner}
        style={{ bottom: px, left: px }}
      />
      <span
        aria-hidden="true"
        className={cn(base, "border-b border-r")}
        data-testid={CardTestId.Corner}
        style={{ bottom: px, right: px }}
      />
    </>
  );
}

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  background?: "elevated" | "raised" | "surface" | "panel" | "glass" | "background" | "accent";
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
  tone?: AnyStateTone;
  /** Make the tone emphasis *live*: swap the static ring for the shared animated
   *  {@link LivingGlow} pulse (same primitive the Chat-UI orb reuses). Requires `tone`. */
  living?: boolean;
  /** Render as a selectable button (forwards onClick / aria-pressed). */
  as?: "div" | "button";
  /** Only meaningful with `as="button"` — defaults to `"button"` so the card
   *  never falls back to the HTML default of `"submit"` inside a `<form>`. */
  type?: "button" | "submit" | "reset";
  /** Highlighted selected state (accent border + ring). */
  selected?: boolean;
  /**
   * A solid 3px accent bar on the left edge, tinted by state — the runs-feed task
   * card's "state at a glance" marker (Phase 29). Deliberately independent of
   * `tone` (full-border tint + optional `living` glow) and `corners` (HUD
   * brackets): `edge` alone is always matte — a done/error card still reads its
   * state at a glance without claiming to be "live". Combine with `tone` +
   * `living` on a genuinely in-flight card for the glow on top of the bar.
   */
  edge?: AnyStateTone;
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
  /** A faint accent-tinted surface (Phase 33's Chat message backgrounds) —
   *  distinguishes a role/state at a glance without a border or glow. */
  accent: "bg-accent-dim",
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

// All three maps below are keyed by the canonical `StateTone` — `tone`/`edge`
// are normalized via `normalizeStateTone` before indexing (see `Card()`). Legacy
// classes are reused where the color is identical (LEGACY_TONE_MAP): thinking→
// accent, blocked→warn, error→bad, done→ok, working→run. Only `idle` needed a
// new class (no legacy tone mapped to it).
const toneBorder: Record<StateTone, string> = {
  thinking: "border-accent/30",
  done: "border-ok/30",
  blocked: "border-warn/30",
  error: "border-bad/30",
  working: "border-run/30",
  idle: "border-state-idle/30",
};

const toneGlow: Record<StateTone, string> = {
  thinking: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]",
  done: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-ok)_12%,transparent)]",
  blocked: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-warn)_12%,transparent)]",
  error: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-bad)_12%,transparent)]",
  working: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-run)_12%,transparent)]",
  idle: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-state-idle)_12%,transparent)]",
};

const edgeClass: Record<StateTone, string> = {
  thinking: "bg-accent",
  done: "bg-ok",
  blocked: "bg-warn",
  error: "bg-bad",
  working: "bg-run",
  idle: "bg-state-idle",
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
  living = false,
  as: Tag = "div",
  type,
  selected = false,
  edge,
  header,
  footer,
  children,
  ref,
  ...rest
}: CardProps) {
  const resolvedTone = tone ? normalizeStateTone(tone) : undefined;
  const resolvedEdge = edge ? normalizeStateTone(edge) : undefined;
  return (
    <Tag
      data-testid={CardTestId.Root}
      // `Tag` is a union ("div" | "button"), so JSX resolves the prop type for
      // `{...rest}` as the intersection of both intrinsic element prop sets —
      // TS can't know at this point which element `rest`'s event handlers were
      // typed against, so a same-shape intersection cast (not `any`) is the
      // narrowest fix; the `as="button"` branch is exercised by Card.test.tsx.
      {...(rest as HTMLAttributes<HTMLDivElement> & ButtonHTMLAttributes<HTMLButtonElement>)}
      className={cn(
        "relative group",
        elevated ? "bg-elevated" : bgClasses[background],
        radiusClasses[radius],
        elevated ? "shadow-[var(--shadow-elevated)]" : shadowClasses[shadow],
        animateClasses[animate],
        clip && "overflow-hidden",
        bordered &&
          (resolvedTone
            ? toneBorder[resolvedTone]
            : elevated
              ? "border border-border-strong"
              : "border border-border"),
        bordered && resolvedTone && "border",
        resolvedTone && !living && toneGlow[resolvedTone],
        borderStyle === "dashed" && "border-dashed",
        Tag === "button" && cn("w-full text-left cursor-pointer", focusRing),
        interactive &&
          "transition-all duration-150 hover:border-accent/35 hover:bg-elevated hover:shadow-card",
        selected && "border-accent bg-raised shadow-[0_0_0_1px_var(--color-accent-dim)]",
      )}
      ref={ref as Ref<HTMLDivElement & HTMLButtonElement>}
      type={Tag === "button" ? (type ?? "button") : undefined}
    >
      {resolvedTone && living && <LivingGlow radius={radius} tone={resolvedTone} />}
      {corners && <Corners inset="100" tone={resolvedTone ?? "idle"} />}
      {resolvedEdge && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l-[inherit]",
            edgeClass[resolvedEdge],
          )}
          data-testid={CardTestId.Edge}
        />
      )}
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
