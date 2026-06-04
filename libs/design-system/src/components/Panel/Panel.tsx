import type { HTMLAttributes, ReactNode, Ref } from "react";
import { Container } from "../Container/Container";
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
  ref?: Ref<HTMLDivElement>;
}

/**
 * A bordered frame with an optional header bar — the recurring "titled panel"
 * around log streams, previews and detail readouts. Domain-neutral: the header
 * and body are caller-provided slots.
 */
export function Panel({ header, headerEnd, padding, children, ref, ...rest }: PanelProps) {
  return (
    <div
      className="overflow-hidden rounded-sm border border-border bg-background"
      data-testid={PanelTestId.Root}
      ref={ref}
      {...rest}
    >
      {(header || headerEnd) && (
        <div
          className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2"
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
