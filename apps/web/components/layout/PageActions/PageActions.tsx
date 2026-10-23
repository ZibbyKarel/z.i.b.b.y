"use client";

import { type ReactNode, createContext, useContext } from "react";
import { createPortal } from "react-dom";

interface Slot {
  element: HTMLElement | null;
  /** True under the shell's provider: render nothing until `element` is set. */
  inShell: boolean;
}

const SlotContext = createContext<Slot>({ element: null, inShell: false });

/** Provides the shell's sub-menu actions slot; `PageActions` portals into it. */
export function PageActionsSlotProvider({
  element,
  children,
}: Omit<Slot, "inShell"> & { children: ReactNode }) {
  return <SlotContext value={{ element, inShell: true }}>{children}</SlotContext>;
}

/**
 * A page's own toolbar controls. Inside the shell they render in the sub-menu
 * row, before the pin toggle and "+ NEW TASK"; standalone they render inline.
 */
export function PageActions({ children }: { children: ReactNode }) {
  const { element, inShell } = useContext(SlotContext);
  if (!element) return inShell ? null : children;
  return createPortal(children, element);
}
