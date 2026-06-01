"use client";
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { useTokens } from "../../DesignSystemContext/hooks";
import { computeVisualStyle } from "../../visualStyles";
import { Corners } from "../HudPanel/HudPanel";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Surface background. */
  background?: "elevated" | "raised" | "surface";
  /** Show border. */
  bordered?: boolean;
  /** Hover/focus interactive style. */
  interactive?: boolean;
  radius?: "none" | "sm" | "default";
  /** Corner bracket decoration (HUD style). */
  corners?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

export function Card({
  background = "elevated",
  bordered = true,
  interactive = false,
  radius = "default",
  corners = false,
  header,
  footer,
  children,
  style,
  className,
  ref,
  ...rest
}: CardProps) {
  const tokens = useTokens();

  const bg = {
    elevated: tokens.color.bg.elevated,
    raised:   tokens.color.bg.raised,
    surface:  tokens.color.bg.surface,
  }[background];

  const visual = computeVisualStyle(
    {
      borderColor: bordered ? "default" : undefined,
      radius: radius,
    },
    tokens,
  );

  const computedStyle: CSSProperties = {
    position:        "relative",
    backgroundColor: bg,
    transition:      interactive ? "border-color 0.15s, background-color 0.15s" : undefined,
    ...visual,
    ...style,
  };

  const classes = ["group", className].filter(Boolean).join(" ");

  return (
    <div {...rest} ref={ref} style={computedStyle} className={classes}>
      {corners && <Corners inset={5} />}
      {header && <CardHeader>{header}</CardHeader>}
      {children}
      {footer && <CardFooter>{footer}</CardFooter>}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  const tokens = useTokens();
  return (
    <div
      className={className}
      style={{
        padding:         "12px 14px 10px",
        borderBottom:    `1px solid ${tokens.color.border.default}`,
        fontWeight:      600,
        fontSize:        "0.75rem",
        fontFamily:      tokens.font.mono,
        letterSpacing:   "0.04em",
        color:           tokens.color.text.secondary,
      }}
    >
      {children}
    </div>
  );
}

export function CardContent({ children, className, padding = "14px" }: { children: ReactNode; className?: string; padding?: string }) {
  return (
    <div className={className} style={{ padding }}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  const tokens = useTokens();
  return (
    <div
      className={className}
      style={{
        padding:      "10px 14px 12px",
        borderTop:    `1px solid ${tokens.color.border.default}`,
        display:      "flex",
        alignItems:   "center",
        gap:          "8px",
      }}
    >
      {children}
    </div>
  );
}

export function CardActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <CardFooter className={className}>
      {children}
    </CardFooter>
  );
}
