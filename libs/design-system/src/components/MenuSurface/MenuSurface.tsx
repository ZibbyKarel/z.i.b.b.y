import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";

export enum MenuSurfaceTestId {
  Root = "menu-surface-root",
}

/** Horizontal placement of the surface under its trigger. */
export type MenuSurfaceAlign = "stretch" | "end";

export interface MenuSurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  /** Horizontal placement under the trigger.
   *  - `stretch` — pinned to both edges (full-width field / search input).
   *  - `end` — right-aligned with a minimum width (compact inline triggers). */
  align?: MenuSurfaceAlign;
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
  scroll = false,
  children,
  ref,
  ...rest
}: MenuSurfaceProps) {
  return (
    <div
      className={cn(
        "absolute top-[calc(100%+6px)] z-50",
        alignClass[align],
        "border border-border rounded-md bg-raised shadow-dropdown",
        scroll ? "max-h-[60vh] overflow-y-auto" : "overflow-hidden",
      )}
      data-testid={MenuSurfaceTestId.Root}
      {...rest}
      ref={ref}
    >
      {children}
    </div>
  );
}
