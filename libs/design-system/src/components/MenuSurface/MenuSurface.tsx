import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";

export enum MenuSurfaceTestId {
  Root = "menu-surface-root",
}

/** Horizontal placement of the surface under its trigger. */
export type MenuSurfaceAlign = "stretch" | "end";

/** How the surface is positioned in the layout.
 *  - `anchored` — `absolute`, just under its `relative` trigger wrapper (the default).
 *    Simple, but clipped by any ancestor with `overflow: hidden`.
 *  - `fixed` — `position: fixed`; the consumer supplies `top`/`left`/`width` via
 *    `style` (typically from the trigger's bounding rect) and renders the surface
 *    through a portal so no ancestor can clip it. */
export type MenuSurfacePlacement = "anchored" | "fixed";

export interface MenuSurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  /** Horizontal placement under the trigger (ignored when `placement` is `fixed` —
   *  the consumer positions the surface explicitly via `style`).
   *  - `stretch` — pinned to both edges (full-width field / search input).
   *  - `end` — right-aligned with a minimum width (compact inline triggers). */
  align?: MenuSurfaceAlign;
  /** Positioning strategy — `anchored` (absolute, default) or `fixed` (portal). */
  placement?: MenuSurfacePlacement;
  /** Cap the height and scroll overflowing content (long result lists);
   *  otherwise the surface clips its content to the radius. */
  scroll?: boolean;
  ref?: Ref<HTMLDivElement>;
}

const alignClass: Record<MenuSurfaceAlign, string> = {
  stretch: "left-0 right-0",
  end: "right-0 min-w-[168px]",
};

/**
 * The floating option-list surface shared by {@link Dropdown} and
 * {@link SearchMenu} — a popover panel anchored just under its trigger. Owns the
 * shared chrome (position, frame, shadow, scroll); consumers render their own
 * rows inside. Pass `role`, `id` and `data-testid` through — they override the
 * defaults so each consumer keeps its own test contract.
 */
export function MenuSurface({
  align = "stretch",
  placement = "anchored",
  scroll = false,
  children,
  ref,
  ...rest
}: MenuSurfaceProps) {
  return (
    <div
      className={cn(
        placement === "fixed"
          ? "fixed z-50"
          : cn("absolute top-[calc(100%+6px)] z-50", alignClass[align]),
        "border border-border rounded-md bg-raised shadow-dropdown",
        scroll ? "max-h-[60vh] overflow-y-auto overflow-x-hidden" : "overflow-hidden",
      )}
      data-testid={MenuSurfaceTestId.Root}
      {...rest}
      ref={ref}
    >
      {children}
    </div>
  );
}
