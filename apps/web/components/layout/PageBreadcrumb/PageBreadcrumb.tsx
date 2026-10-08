"use client";

import { type ReactNode, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Breadcrumb, type BreadcrumbProps } from "@zibby/design-system";

interface Slot {
  element: HTMLElement | null;
  /** Hrefs of the active sub-menu tab (its href and/or match prefix). */
  activeHrefs: readonly string[];
  /** True under the shell's provider: render nothing until `element` is set. */
  inShell: boolean;
}

const SlotContext = createContext<Slot>({ element: null, activeHrefs: [], inShell: false });

/** Provides the shell's sub-menu trail slot; `PageBreadcrumb` portals into it. */
export function PageBreadcrumbSlotProvider({
  element,
  activeHrefs,
  children,
}: Omit<Slot, "inShell"> & { children: ReactNode }) {
  return <SlotContext value={{ element, activeHrefs, inShell: true }}>{children}</SlotContext>;
}

/**
 * A page's breadcrumb. Inside the shell it renders in the sub-menu row (minus a
 * leading crumb that just repeats the active sub-menu item); standalone it
 * renders inline.
 */
export function PageBreadcrumb({ items, ...rest }: BreadcrumbProps) {
  const { element, activeHrefs, inShell } = useContext(SlotContext);
  if (!element) return inShell ? null : <Breadcrumb items={items} {...rest} />;
  const first = items[0]?.href;
  const trail = first && activeHrefs.includes(first) ? items.slice(1) : items;
  if (trail.length === 0) return null;
  return createPortal(<Breadcrumb leadingSeparator items={trail} {...rest} />, element);
}
