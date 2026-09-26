import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";

export enum SubNavTestId {
  Root = "subnav-root",
  List = "subnav-list",
  Item = "subnav-item",
  Actions = "subnav-actions",
}

export interface SubNavItem {
  href: string;
  label: string;
  active?: boolean;
}

/** An anchor-shaped component contract — matches both a plain `<a>` and Next's
 *  `Link` (same prop surface), so an app can pass its router's `Link` in
 *  without the DS ever importing `next/link` (chrome stays router-agnostic). */
export type SubNavLinkComponent = ComponentType<
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; children?: ReactNode }
>;

export interface SubNavProps {
  items: SubNavItem[];
  /** Right-aligned slot (e.g. "+ NEW TASK") — DS App mock's subnav row. */
  actions?: ReactNode;
  /** Overrides the rendered anchor — pass the app's `next/link` `Link` to get
   *  client-side navigation. Defaults to a plain `<a>`. */
  linkComponent?: SubNavLinkComponent;
  /**
   * `"horizontal"` (default) — the DS App mock's top strip, an `--ink`
   * underline on the active item. `"responsive"` (ZB-11 Settings sub-nav)
   * renders the SAME strip below the `lg` breakpoint (≥1024px) and switches to
   * a left-hand column — a vertical list with a left-edge active indicator —
   * at `lg:` and up, so a section with many sub-pages (Settings) doesn't force
   * a cramped horizontal scroller on desktop.
   */
  orientation?: "horizontal" | "responsive";
}

const itemClass = (active: boolean, responsive: boolean) =>
  cn(
    "flex items-center whitespace-nowrap font-mono text-[11px] uppercase tracking-wider",
    "border-b transition-colors",
    focusRingInset,
    responsive
      ? "h-9 px-3 lg:h-auto lg:w-full lg:border-b-0 lg:border-l lg:px-3 lg:py-2"
      : "h-full px-3",
    active ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
  );

/**
 * DS.md §8 "Tabs (top nav)" applied to a section's sub-navigation row (DS App
 * mock's subnav strip) — mono uppercase links with a 1px `--ink` underline on
 * the active item, plus a right-aligned `actions` slot. Unlike {@link Tabs}
 * (an internal active/value state machine), `SubNav` is route-driven: `active`
 * comes from the caller's own route match, and each item is a real link.
 *
 * `orientation="responsive"` (ZB-11) keeps the same strip on narrow viewports
 * and reflows into a left-hand vertical column at `lg:` — see {@link SubNavProps}.
 */
export function SubNav({ items, actions, linkComponent, orientation = "horizontal" }: SubNavProps) {
  const Link = linkComponent ?? "a";
  const responsive = orientation === "responsive";
  return (
    <div
      className={cn(
        "flex",
        responsive
          ? "flex-col lg:h-full lg:items-stretch lg:justify-start"
          : "items-stretch justify-between border-b border-border",
      )}
      data-testid={SubNavTestId.Root}
    >
      <nav
        className={cn(
          "flex items-stretch gap-0",
          responsive &&
            "overflow-x-auto border-b border-border lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r",
        )}
        data-testid={SubNavTestId.List}
      >
        {items.map((item) => (
          <Link
            aria-current={item.active ? "page" : undefined}
            className={itemClass(Boolean(item.active), responsive)}
            data-testid={`${SubNavTestId.Item}-${item.href}`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {actions && (
        <div
          className={cn("flex items-center gap-2 px-3", responsive && "py-2")}
          data-testid={SubNavTestId.Actions}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
