import type { ReactNode, Ref } from "react";

export enum RailSplitTestId {
  Root = "rail-split-root",
  Rail = "rail-split-rail",
  Toolbar = "rail-split-toolbar",
  Body = "rail-split-body",
  Footer = "rail-split-footer",
}

export interface RailSplitProps {
  /** Left 260px column, scrolls on its own, hairline on the right. */
  rail: ReactNode;
  /** Right column row 1 (panel bg, bottom hairline). */
  toolbar?: ReactNode;
  /** Right column row 2: the scrolling body. */
  children: ReactNode;
  /** Right column row 3 (panel bg, top hairline). */
  footer?: ReactNode;
  /** The scrolling body element — a feed auto-scrolls it. */
  bodyRef?: Ref<HTMLDivElement>;
  ref?: Ref<HTMLDivElement>;
}

/** Rail + toolbar/body/footer layout at viewport height (Run Detail). Stacks to
 * one column below `lg`, rail on top.
 *
 * lg height = 100vh − 336px chrome above it (app bar, sub-nav, run header + metrics,
 * measured at 1440×900) − the 72px `AppFrame` keeps free under the content for the
 * floating chat dock — otherwise the footer (composer) sits under the dock. */
export function RailSplit({ rail, toolbar, children, footer, bodyRef, ref }: RailSplitProps) {
  return (
    <div
      className="grid min-h-[560px] grid-cols-1 border-b border-border lg:h-[calc(100vh-408px)] lg:min-h-[320px] lg:grid-cols-[260px_minmax(0,1fr)]"
      data-testid={RailSplitTestId.Root}
      ref={ref}
    >
      <div
        className="flex max-h-[240px] min-h-0 flex-col overflow-auto border-b border-border lg:max-h-none lg:border-r lg:border-b-0"
        data-testid={RailSplitTestId.Rail}
      >
        {rail}
      </div>
      <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-background">
        {toolbar ? (
          <div
            className="border-b border-border bg-surface px-5 py-[10px]"
            data-testid={RailSplitTestId.Toolbar}
          >
            {toolbar}
          </div>
        ) : (
          <div />
        )}
        <div
          className="flex min-h-0 flex-col gap-[14px] overflow-auto px-6 py-5"
          data-testid={RailSplitTestId.Body}
          ref={bodyRef}
        >
          {children}
        </div>
        {footer ? (
          <div
            className="border-t border-border bg-surface px-5 py-3"
            data-testid={RailSplitTestId.Footer}
          >
            {footer}
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
