"use client";
import type { ReactNode, Ref } from "react";
import { LAYOUT } from "../../tokens";
import { cn } from "../../utils/cn";

export enum AppFrameTestId {
  Root = "app-frame-root",
  SkipLink = "app-frame-skip-link",
  Header = "app-frame-header",
  Body = "app-frame-body",
  Rail = "app-frame-rail",
  SubNav = "app-frame-subnav",
  Main = "app-frame-main",
  Dock = "app-frame-dock",
}

/**
 * The one `<main>` landmark id `AppFrame` renders — matches the pre-existing
 * app-wide `SkipLink` contract's target id (`apps/web/components/layout/
 * SkipLink`) so wiring `AppFrame` into the app (ZA-07) is a drop-in, not a
 * rename. The namespaced export name is historical (the retired
 * `ImmersiveShell` once exported a bare `MAIN_CONTENT_ID`).
 */
export const APP_FRAME_MAIN_CONTENT_ID = "main-content";

export interface AppFrameProps {
  /** The `AppHeader`. */
  header: ReactNode;
  /** The section `SubNav` strip, rendered above the page content, right of
   *  the rail. */
  subnav?: ReactNode;
  /** The left rail (the `ActivityDock`), rendered inline in a content-sized
   *  column at every width — the child decides its own width. */
  rail?: ReactNode;
  /** The `ChatDock`, floated bottom-right over the content. */
  dock?: ReactNode;
  children: ReactNode;
  /** Opt-in full-bleed mode for pages that own their own pan/zoom canvas: drops the
   *  `docMaxWidth` cap, gives the content wrapper the full height of `<main>`, and
   *  stops `<main>` from scrolling. Default `false` leaves every other page unchanged. */
  fullBleed?: boolean;
  skipLinkLabel?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The ZibbyCorp app shell — DS.md §5's grid: a 56px header row over a
 * `auto | 1fr` body (rail + main) — the rail column is as wide as its child
 * (the `ActivityDock`: 50px bar, plus its body when open) — content capped at
 * `LAYOUT.docMaxWidth` with the 24px grid background. At 390px nothing
 * overflows horizontally. A skip link (jumping straight to the `<main>` landmark) is
 * built in — this replaces the app's standalone `SkipLink` mount once wired
 * (ZA-07).
 */
export function AppFrame({
  header,
  subnav,
  rail,
  dock,
  children,
  fullBleed = false,
  skipLinkLabel = "Skip to main content",
  ref,
}: AppFrameProps) {
  return (
    <div
      className="grid h-full w-full overflow-x-hidden bg-background"
      data-testid={AppFrameTestId.Root}
      ref={ref}
      // The single column is pinned to `minmax(0,1fr)`: an implicit `auto`
      // track would grow to the header's min-content width (its section nav
      // alone is ~1100px), widening the whole body past a 390px viewport, where
      // the root's `overflow-x-hidden` then silently clipped the page content.
      style={{
        gridTemplateColumns: "minmax(0,1fr)",
        gridTemplateRows: `${LAYOUT.headerHeight}px minmax(0,1fr)`,
      }}
    >
      <a
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]",
          "focus:border focus:border-ink focus:bg-panel focus:px-4 focus:py-2",
          "focus:font-mono focus:text-[11px] focus:uppercase focus:tracking-wider focus:text-ink",
        )}
        data-testid={AppFrameTestId.SkipLink}
        href={`#${APP_FRAME_MAIN_CONTENT_ID}`}
      >
        {skipLinkLabel}
      </a>

      {/* Below the header's natural width the header scrolls on its own
          axis instead of widening the frame. */}
      <div className="min-w-0 overflow-x-auto" data-testid={AppFrameTestId.Header}>
        {header}
      </div>

      <div
        className={cn("grid min-h-0", rail ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-1")}
        data-testid={AppFrameTestId.Body}
        // Without an explicit row track, an auto-sized grid row grows to the
        // rail's/main's full content height (CSS grid's auto-row sizing uses
        // items' max-content contribution) — the overflow then escapes this
        // (overflow-visible) div and scrolls the page instead of each pane
        // scrolling on its own (ZB-16).
        style={{ gridTemplateRows: "minmax(0,1fr)" }}
      >
        {rail && (
          <div className="relative h-full min-h-0" data-testid={AppFrameTestId.Rail}>
            {rail}
          </div>
        )}

        <div
          className="relative grid min-h-0 min-w-0"
          style={{ gridTemplateRows: "min-content minmax(0,1fr)" }}
        >
          {subnav && (
            <div
              className="min-w-0 overflow-x-auto"
              data-testid={AppFrameTestId.SubNav}
              style={{ height: LAYOUT.subNavHeight }}
            >
              {subnav}
            </div>
          )}

          <main
            className={cn(
              "min-h-0 min-w-0",
              fullBleed ? "overflow-hidden" : "overflow-x-auto overflow-y-auto",
            )}
            data-testid={AppFrameTestId.Main}
            id={APP_FRAME_MAIN_CONTENT_ID}
            style={{
              backgroundImage:
                "linear-gradient(var(--color-grid) 1px, transparent 1px)," +
                "linear-gradient(90deg, var(--color-grid) 1px, transparent 1px)",
              backgroundSize: `${LAYOUT.gridSize}px ${LAYOUT.gridSize}px`,
            }}
            tabIndex={-1}
          >
            <div
              className={cn("mx-auto w-full", fullBleed && "h-full")}
              style={fullBleed ? undefined : { maxWidth: LAYOUT.docMaxWidth }}
            >
              {children}
            </div>
          </main>

          {dock && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-end p-5">
              <div className="pointer-events-auto" data-testid={AppFrameTestId.Dock}>
                {dock}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
