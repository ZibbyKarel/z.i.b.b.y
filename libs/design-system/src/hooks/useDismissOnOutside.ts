"use client";
import { type RefObject, useEffect, useRef } from "react";

export interface UseDismissOnOutsideOptions {
  open: boolean;
  /** Elements that count as "inside" (trigger root, portaled menu). A
   * pointerdown inside any of them is ignored, so the trigger keeps its own
   * toggle and option clicks still land. */
  refs: ReadonlyArray<RefObject<HTMLElement | null>>;
  onDismiss: () => void;
}

/**
 * Dismisses a menu/popover on a pointerdown anywhere outside `refs`. Uses a
 * capture-phase `document` listener instead of a `fixed inset-0` click-catcher
 * so it also fires inside `Dialog`/`Sheet`/other `z-50` overlays, which sit
 * above any catcher and swallowed the outside click (todo-12).
 */
export function useDismissOnOutside({ open, refs, onDismiss }: UseDismissOnOutsideOptions): void {
  const onDismissRef = useRef(onDismiss);
  const refsRef = useRef(refs);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    refsRef.current = refs;
  });

  useEffect(() => {
    if (!open) return;
    const handle = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (refsRef.current.some((ref) => ref.current?.contains(target))) return;
      onDismissRef.current();
    };
    document.addEventListener("pointerdown", handle, true);
    return () => document.removeEventListener("pointerdown", handle, true);
  }, [open]);
}
