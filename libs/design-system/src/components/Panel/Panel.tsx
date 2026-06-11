import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { Container } from "../Container/Container";
import { Corners, type CornersTone } from "../Card/Card";
import type { Padding } from "../../tokens";

export enum PanelTestId {
  Root = "panel-root",
  Header = "panel-header",
  Body = "panel-body",
}

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  /** Left-aligned header content (icon + label). Omit for a header-less frame. */
  header?: ReactNode;
  /** Right-aligned header content (meta, status, actions). */
  headerEnd?: ReactNode;
  /** Body padding token; omit to let the body content own its spacing. */
  padding?: Padding;
  /** Live panel — corner brackets in the live color; reserve for running/awaiting content. */
  live?: boolean;
  /** Bracket color of a live panel. */
  liveTone?: CornersTone;
  /** Elevated panel — one step above surface, with the elevation shadow. */
  hi?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The single titled surface (design `ZtPanel`) — matte by default; corner
 * brackets mark live panels only ("light only on what's alive").
 */
export function Panel({
  header,
  headerEnd,
  padding,
  live = false,
  liveTone = "run",
  hi = false,
  children,
  ref,
  ...rest
}: PanelProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border",
        hi
          ? "border-border-strong bg-elevated shadow-[var(--shadow-elevated)]"
          : "border-border bg-surface",
      )}
      data-testid={PanelTestId.Root}
      ref={ref}
      {...rest}
    >
      {live && <Corners inset="75" tone={liveTone} />}
      {(header || headerEnd) && (
        <div
          className="flex items-center gap-2 border-b border-border px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-wider text-foreground-faint"
          data-testid={PanelTestId.Header}
        >
          {header}
          {headerEnd && <span className="ml-auto">{headerEnd}</span>}
        </div>
      )}
      {padding !== undefined ? (
        <Container data-testid={PanelTestId.Body} padding={padding}>
          {children}
        </Container>
      ) : (
        <div data-testid={PanelTestId.Body}>{children}</div>
      )}
    </div>
  );
}
