"use client";

import { type ReactNode, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Breadcrumb, type BreadcrumbProps } from "@zibby/design-system";

interface Slot {
  element: HTMLElement | null;
  activeHref: string | null;
}

const SlotContext = createContext<Slot>({ element: null, activeHref: null });

/** Provides the shell's sub-menu trail slot; `PageBreadcrumb` portals into it. */
export function PageBreadcrumbSlotProvider({
  element,
  activeHref,
  children,
}: Slot & { children: ReactNode }) {
  return <SlotContext value={{ element, activeHref }}>{children}</SlotContext>;
}

/**
 * A page's breadcrumb. Inside the shell it renders in the sub-menu row (minus a
 * leading crumb that just repeats the active sub-menu item); standalone it
 * renders inline.
 */
export function PageBreadcrumb({ items, ...rest }: BreadcrumbProps) {
  const { element, activeHref } = useContext(SlotContext);
  if (!element) return <Breadcrumb items={items} {...rest} />;
  const trail = items[0]?.href && items[0].href === activeHref ? items.slice(1) : items;
  if (trail.length === 0) return null;
  return createPortal(<Breadcrumb leadingSeparator items={trail} {...rest} />, element);
}
