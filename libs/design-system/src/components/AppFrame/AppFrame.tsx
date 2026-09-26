"use client";
import type { ReactNode, Ref } from "react";
import { useId, useState } from "react";
import { LAYOUT } from "../../tokens";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";

export enum AppFrameTestId {
  Root = "app-frame-root",
  SkipLink = "app-frame-skip-link",
  Header = "app-frame-header",
  Body = "app-frame-body",
  RailToggle = "app-frame-rail-toggle",
  RailBackdrop = "app-frame-rail-backdrop",
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
  /** The `Rail` ("NEEDS YOU"). Below 1024px it collapses into a toggleable
   *  drawer instead of a static column. */
  rail?: ReactNode;
  /** The `ChatDock`, floated bottom-right over the content. */
  dock?: ReactNode;
  children: ReactNode;
  skipLinkLabel?: string;
  /** Accessible label for the mobile rail-drawer toggle (also its visible
   *  text — DS.md ZA-06 calls for a labelled button, not an icon-only one). */
  railToggleLabel?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The ZibbyCorp app shell — DS.md §5's grid: a 56px header row over a
 * `280px | 1fr` body (rail + main), content capped at `LAYOUT.docMaxWidth`
 * with the 24px grid background. Below 1024px the rail becomes a slide-in
 * drawer behind a labelled toggle button; at 390px nothing overflows
 * horizontally. A skip link (jumping straight to the `<main>` landmark) is
 * built in — this replaces the app's standalone `SkipLink` mount once wired
 * (ZA-07).
 */
export function AppFrame({
  header,
  subnav,
  rail,
  dock,
  children,
  skipLinkLabel = "Skip to main content",
  railToggleLabel = "Needs you",
  ref,
}: AppFrameProps) {
  const railId = useId();
  const [railOpen, setRailOpen] = useState(false);

  return (
    <div
      className="grid h-full w-full overflow-x-hidden bg-background"
      data-testid={AppFrameTestId.Root}
      ref={ref}
      style={{ gridTemplateRows: `${LAYOUT.headerHeight}px minmax(0,1fr)` }}
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

      <div data-testid={AppFrameTestId.Header}>{header}</div>

      <div
        className="grid min-h-0 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]"
        data-testid={AppFrameTestId.Body}
      >
        {rail && (
          <>
            {railOpen && (
              <div
                aria-hidden="true"
                className="fixed inset-0 z-30 bg-[var(--color-overlay)] lg:hidden"
                data-testid={AppFrameTestId.RailBackdrop}
                onClick={() => setRailOpen(false)}
              />
            )}
            <button
              aria-controls={railId}
              aria-expanded={railOpen}
              aria-label={railToggleLabel}
              className={cn(
                "fixed left-3 z-30 border border-line-2 bg-panel px-2.5 py-1.5",
                "font-mono text-[10px] uppercase tracking-wider text-ink-2 lg:hidden",
                focusRing,
              )}
              data-testid={AppFrameTestId.RailToggle}
              onClick={() => setRailOpen((v) => !v)}
              style={{ top: LAYOUT.headerHeight + 12 }}
              type="button"
            >
              {railToggleLabel}
            </button>
            <div
              className={cn(
                "fixed bottom-0 left-0 z-40 w-[280px] -translate-x-full border-r border-line",
                "bg-panel transition-transform duration-200",
                "lg:static lg:z-auto lg:h-full lg:w-auto lg:translate-x-0",
                railOpen && "translate-x-0",
              )}
              data-testid={AppFrameTestId.Rail}
              id={railId}
              style={{ top: LAYOUT.headerHeight }}
            >
              {rail}
            </div>
          </>
        )}

        <div
          className="relative grid min-h-0 min-w-0"
          style={{ gridTemplateRows: "min-content minmax(0,1fr)" }}
        >
          {subnav && <div data-testid={AppFrameTestId.SubNav}>{subnav}</div>}

          <main
            className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto"
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
            <div className="mx-auto w-full" style={{ maxWidth: LAYOUT.docMaxWidth }}>
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
