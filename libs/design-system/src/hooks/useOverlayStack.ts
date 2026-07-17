"use client";
import { useCallback, useEffect, useRef } from "react";

/**
 * Coordinates body-scroll-lock and keyboard-handler precedence across every
 * concurrently mounted modal-like overlay (DS `Dialog`, `SubsystemDrawer`, any
 * future full-screen surface) via one shared, ref-counted stack. A
 * per-component effect can't know a SIBLING overlay is mounted at the same
 * time — without this, the most-recently-closed overlay's cleanup clobbers
 * state a still-open ancestor depends on. Fixes a real bug found in the
 * phase-125 whole-branch review: closing a `Dialog` opened from inside
 * `SubsystemDrawer` re-enabled body scroll and let both overlays' Escape/Tab
 * handlers fire at once.
 */
let stack: string[] = [];
let previousBodyOverflow: string | null = null;
let nextId = 0;

function push(id: string) {
  if (stack.length === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  stack.push(id);
}

function pop(id: string) {
  stack = stack.filter((entry) => entry !== id);
  if (stack.length === 0) {
    document.body.style.overflow = previousBodyOverflow ?? "";
    previousBodyOverflow = null;
  }
}

export interface OverlayStackHandle {
  /** True only for the most-recently-mounted active overlay. Gate
   * document-level Escape/Tab handlers on this so a nested overlay gets
   * exclusive keyboard control while it's open. */
  isTopmost: () => boolean;
}

/** `active` mirrors the caller's own open/mounted condition (e.g. `Dialog`'s
 * `open` prop, or `true` for the whole mounted lifetime of a component that
 * IS the modal, like `SubsystemDrawer`). */
export function useOverlayStack(active: boolean): OverlayStackHandle {
  const idRef = useRef<string | undefined>(undefined);
  if (idRef.current === undefined) {
    idRef.current = `overlay-${nextId++}`;
  }
  // Lazy-init-via-ref idiom: the ref is guaranteed set by the check above on
  // every render, but `react-hooks/refs` (React Compiler rules) can't see
  // that and flags any `.current` read during render as unsafe.
  // eslint-disable-next-line react-hooks/refs
  const id = idRef.current;

  useEffect(() => {
    if (!active) return;
    push(id);
    return () => pop(id);
  }, [active, id]);

  const isTopmost = useCallback(() => stack.at(-1) === id, [id]);

  return { isTopmost };
}
