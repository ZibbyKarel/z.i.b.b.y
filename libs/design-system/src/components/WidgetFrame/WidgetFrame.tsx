"use client";

import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { cn } from "../../utils/cn";
import { Icon } from "../Icon/Icon";

export enum WidgetFrameTestId {
  Root = "widget-frame-root",
  Header = "widget-frame-header",
  Label = "widget-frame-label",
  Count = "widget-frame-count",
  You = "widget-frame-you",
  Aside = "widget-frame-aside",
  /** The per-widget "sync" button (disabled + spinning while `refreshing`). */
  Refresh = "widget-frame-refresh",
  Collapse = "widget-frame-collapse",
  Remove = "widget-frame-remove",
  /** The per-widget "configure" toggle (aria-pressed). */
  Configure = "widget-frame-configure",
  Body = "widget-frame-body",
  /** Plain wrapper around the children (and empty box) inside the body; its height is the content's natural height. */
  Content = "widget-frame-content",
  /** The first-load spinner row (role=status) shown above the children while `loading`. */
  Loading = "widget-frame-loading",
  Size = "widget-frame-size",
  /** Resize handle prefix; each corner handle is suffixed `-nw|ne|sw|se`. */
  Resize = "widget-frame-resize",
}

/** Which corner a resize drag started from. */
export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export interface WidgetFrameProps {
  label: string;
  /** Item count, shown tabular next to the label. */
  count?: string;
  /** "Needs you" badge text, e.g. `02 YOU`. Hidden when empty/undefined. */
  you?: string;
  /** Right-aligned header note (e.g. `ALL CLEAR`). */
  aside?: string;
  /** Shows a header sync button left of the caret; disabled and spinning while `refreshing`. */
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshLabel?: string;
  /** Body hidden, header only. */
  collapsed?: boolean;
  /** Shows the ▾/▸ caret (for non-empty widgets) when provided. */
  onToggleCollapse?: () => void;
  collapseLabel?: string;
  /** Being dragged/resized: ink border, no geometry transition, raised z-index. */
  dragging?: boolean;
  /** The widget has nothing to show: the body collapses to the header only. */
  empty?: boolean;
  /** The widget is fetching for the first time: shows a spinner row above the children. */
  loading?: boolean;
  /** Accessible name of the loader. */
  loadingLabel?: string;
  /** `W × H` label shown bottom-left while `dragging`. */
  sizeLabel?: string;
  /** Shows the `×` (on header hover / focus-within). */
  onRemove?: () => void;
  removeLabel?: string;
  /** Shows a header "configure" toggle (gear, `aria-pressed={configuring}`). */
  onConfigure?: () => void;
  /** The widget is being configured: toggle pressed, body forced open. */
  configuring?: boolean;
  configureLabel?: string;
  /** Header pointer-down — start a move drag. */
  onMovePointerDown?: (e: PointerEvent<HTMLElement>) => void;
  /** Resize handle pointer-down — start a resize drag from `corner`. */
  onResizePointerDown?: (e: PointerEvent<HTMLElement>, corner: ResizeCorner) => void;
  resizeLabel?: string;
  /** Corner names appended to `resizeLabel` so each handle has a distinct accessible name. */
  resizeCornerLabels?: Partial<Record<ResizeCorner, string>>;
  /** Geometry passthrough — `left/top/width/height` set by the board. */
  style?: CSSProperties;
  /** Widget content. Always mounted (hidden while closed) so the widget keeps
   *  reporting its own emptiness. */
  children?: ReactNode;
  /** Reports the frame's height if it were `height: auto` (borders + header + content), on mount
   *  and whenever the header or content resizes. */
  onNaturalHeight?: (px: number) => void;
  ref?: Ref<HTMLElement>;
}

const RESIZE_HANDLES: Record<ResizeCorner, string> = {
  nw: "-left-px -top-px cursor-nwse-resize border-l-2 border-t-2",
  ne: "-right-px -top-px cursor-nesw-resize border-r-2 border-t-2",
  sw: "-bottom-px -left-px cursor-nesw-resize border-b-2 border-l-2",
  se: "-bottom-px -right-px cursor-nwse-resize border-b-2 border-r-2",
};

const CORNER_NAMES: Record<ResizeCorner, string> = {
  nw: "top left",
  ne: "top right",
  sw: "bottom left",
  se: "bottom right",
};

const headerBtn = "cursor-pointer bg-transparent px-[6px] py-[2px] text-ink-3 hover:text-ink";

/**
 * A board widget's chrome: square panel, header (label · count · YOU badge · aside ·
 * caret · configure · ×), scrolling body, and the always-on affordances (header move
 * cursor, four corner resize handles; size label while dragging). Positioned `absolute` — the caller supplies geometry via `style`
 * inside a `WidgetBoard`. Sizes read the `--bridge-*` density variables.
 */
export function WidgetFrame({
  label,
  count,
  you,
  aside,
  onRefresh,
  refreshing = false,
  refreshLabel,
  collapsed = false,
  onToggleCollapse,
  collapseLabel,
  dragging = false,
  empty = false,
  loading = false,
  loadingLabel,
  sizeLabel,
  onRemove,
  removeLabel,
  onConfigure,
  configuring = false,
  configureLabel,
  onMovePointerDown,
  onResizePointerDown,
  resizeLabel,
  resizeCornerLabels,
  style,
  children,
  onNaturalHeight,
  ref,
}: WidgetFrameProps) {
  const open = configuring || !(empty || collapsed);
  const rootRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const header = headerRef.current;
    const content = contentRef.current;
    if (!onNaturalHeight || !root || !header || !content) return;
    const report = () => {
      // Open widgets render nothing while loading; reporting 0 would collapse them.
      const contentH = open ? Math.ceil(content.getBoundingClientRect().height) : 0;
      if (open && contentH === 0) return;
      onNaturalHeight(
        root.offsetHeight -
          root.clientHeight +
          Math.ceil(header.getBoundingClientRect().height) +
          contentH,
      );
    };
    report();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(report);
    ro.observe(header);
    ro.observe(content);
    return () => ro.disconnect();
  }, [onNaturalHeight, open]);
  const setRoot = useCallback(
    (el: HTMLElement | null) => {
      rootRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );
  const canToggle = !!onToggleCollapse && !empty;

  return (
    <section
      className={cn(
        "group absolute box-border flex min-w-0 flex-col rounded-lg border bg-panel shadow-[var(--bridge-shadow)]",
        "transition-[left,top,width,height] duration-150 ease-out motion-reduce:transition-none",
        dragging ? "z-[5] border-ink transition-none" : "border-[color:var(--bridge-border)]",
      )}
      data-testid={WidgetFrameTestId.Root}
      ref={setRoot}
      style={style}
    >
      <header
        className={cn(
          "flex select-none items-center gap-[8px] pl-[var(--bridge-head-px)] pr-[10px] font-sans text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap",
          open
            ? "box-content h-[var(--bridge-head-h)] flex-none border-b border-line"
            : "box-border h-[calc(var(--bridge-rh)-2px)] flex-none",
          "cursor-move",
        )}
        data-testid={WidgetFrameTestId.Header}
        onPointerDown={onMovePointerDown}
        ref={headerRef}
      >
        <span className="text-ink" data-testid={WidgetFrameTestId.Label}>
          {label}
        </span>
        {count ? (
          <span className="tabular-nums text-ink-2" data-testid={WidgetFrameTestId.Count}>
            {count}
          </span>
        ) : null}
        {you ? (
          <span
            className="rounded-sm border border-ink px-[5px] py-px text-ink"
            data-testid={WidgetFrameTestId.You}
          >
            {you}
          </span>
        ) : null}
        <span className="flex-1" />
        {aside ? (
          <span className="text-ink-3" data-testid={WidgetFrameTestId.Aside}>
            {aside}
          </span>
        ) : null}
        {onRefresh ? (
          <button
            aria-label={refreshLabel ?? "Sync"}
            className={cn(headerBtn, "disabled:cursor-default disabled:opacity-60")}
            data-testid={WidgetFrameTestId.Refresh}
            disabled={refreshing}
            onClick={onRefresh}
            onPointerDown={(e) => e.stopPropagation()}
            title={refreshLabel ?? "Sync"}
            type="button"
          >
            <span
              className={cn("block", refreshing && "animate-spinner motion-reduce:animate-none")}
            >
              <Icon name="retry" size="sm" />
            </span>
          </button>
        ) : null}
        {canToggle ? (
          <button
            aria-expanded={!collapsed}
            aria-label={collapseLabel}
            className={headerBtn}
            data-testid={WidgetFrameTestId.Collapse}
            onClick={onToggleCollapse}
            onPointerDown={(e) => e.stopPropagation()}
            title={collapseLabel}
            type="button"
          >
            {collapsed ? "▸" : "▾"}
          </button>
        ) : null}
        {onConfigure ? (
          <button
            aria-label={configureLabel ?? "Configure"}
            aria-pressed={configuring}
            className={cn(headerBtn, configuring && "text-ink")}
            data-testid={WidgetFrameTestId.Configure}
            onClick={onConfigure}
            onPointerDown={(e) => e.stopPropagation()}
            title={configureLabel ?? "Configure"}
            type="button"
          >
            <Icon name="gear" size="sm" />
          </button>
        ) : null}
        {onRemove ? (
          <button
            aria-label={removeLabel}
            className={cn(
              headerBtn,
              "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100",
            )}
            data-testid={WidgetFrameTestId.Remove}
            onClick={onRemove}
            onPointerDown={(e) => e.stopPropagation()}
            title={removeLabel}
            type="button"
          >
            ×
          </button>
        ) : null}
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        data-testid={WidgetFrameTestId.Body}
        hidden={!open}
      >
        <div className="flow-root" data-testid={WidgetFrameTestId.Content} ref={contentRef}>
          {loading ? (
            <div
              aria-label={loadingLabel}
              className="px-[var(--bridge-head-px)] py-[10px]"
              data-testid={WidgetFrameTestId.Loading}
              role="status"
            >
              <span className="block h-3 w-3 rounded-full border-[1.5px] border-ink-2/30 border-t-ink-2 animate-spinner motion-reduce:animate-none" />
            </div>
          ) : null}
          {children}
        </div>
      </div>
      {dragging ? (
        <span
          className="absolute bottom-[6px] left-[12px] rounded-sm bg-panel px-[4px] py-[2px] font-mono text-[10px] text-ink-3"
          data-testid={WidgetFrameTestId.Size}
        >
          {sizeLabel}
        </span>
      ) : null}
      {(Object.keys(RESIZE_HANDLES) as ResizeCorner[]).map((corner) => {
        const name = `${resizeLabel ?? "Resize"} (${resizeCornerLabels?.[corner] ?? CORNER_NAMES[corner]})`;
        return (
          <div
            aria-label={name}
            className={cn(
              "absolute box-border h-[12px] w-[12px] border-ink",
              "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
              dragging && "opacity-100",
              RESIZE_HANDLES[corner],
            )}
            data-testid={`${WidgetFrameTestId.Resize}-${corner}`}
            key={corner}
            onPointerDown={(e) => onResizePointerDown?.(e, corner)}
            role="separator"
            title={name}
          />
        );
      })}
    </section>
  );
}
