import type { HTMLAttributes, ReactNode, Ref } from "react";
import { Container } from "../Container/Container";
import { Card, Corners, type CornersTone } from "../Card/Card";
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
  /** Live panel: corner brackets in the live color; reserve for running/awaiting content. */
  live?: boolean;
  /** Bracket color of a live panel. */
  liveTone?: CornersTone;
  /** Elevated panel: one step above surface, with the elevation shadow. */
  elevated?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The single titled surface (design `ZtPanel`): a clipped {@link Card} with a
 * matte default; corner brackets mark live panels only ("light only on what's
 * alive").
 */
export function Panel({
  header,
  headerEnd,
  padding,
  live = false,
  liveTone = "run",
  elevated = false,
  children,
  ref,
  ...rest
}: PanelProps) {
  return (
    <Card
      clip
      background="surface"
      data-testid={PanelTestId.Root}
      elevated={elevated}
      radius="lg"
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
    </Card>
  );
}
