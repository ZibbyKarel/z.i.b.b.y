import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Row } from "../Stack/Stack";

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
}

const itemClass = (active: boolean) =>
  cn(
    "flex h-full items-center whitespace-nowrap px-3 font-mono text-[11px] uppercase tracking-wider",
    "border-b transition-colors",
    focusRingInset,
    active ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
  );

/**
 * DS.md §8 "Tabs (top nav)" applied to a section's sub-navigation row (DS App
 * mock's subnav strip) — mono uppercase links with a 1px `--ink` underline on
 * the active item, plus a right-aligned `actions` slot. Unlike {@link Tabs}
 * (an internal active/value state machine), `SubNav` is route-driven: `active`
 * comes from the caller's own route match, and each item is a real link.
 */
export function SubNav({ items, actions, linkComponent }: SubNavProps) {
  const Link = linkComponent ?? "a";
  return (
    <Row
      align="stretch"
      data-testid={SubNavTestId.Root}
      justify="between"
      style={{ borderBottom: "1px solid var(--color-line)" }}
    >
      <Row align="stretch" as="nav" data-testid={SubNavTestId.List} gap="0">
        {items.map((item) => (
          <Link
            aria-current={item.active ? "page" : undefined}
            className={itemClass(Boolean(item.active))}
            data-testid={`${SubNavTestId.Item}-${item.href}`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </Row>
      {actions && (
        <Row data-testid={SubNavTestId.Actions} gap="100">
          {actions}
        </Row>
      )}
    </Row>
  );
}
