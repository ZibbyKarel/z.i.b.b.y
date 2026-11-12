"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { type SwipeDirection, createSwipeDetector } from "./swipeGesture";

/** True when `target` or an ancestor is a horizontal scroller that can still scroll in `dir`. */
export function canScrollHorizontally(target: EventTarget | null, dir: SwipeDirection): boolean {
  let el = target instanceof Element ? target : null;
  while (el) {
    const { overflowX } = getComputedStyle(el);
    if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth) {
      if (dir === "back" ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Two-finger trackpad swipe = history back/forward, like a browser. Electron has no such
 * gesture (todo-6), so inside ZibbyOS.app (`window.zibbyDesktop` exists) we derive it from wheel events.
 */
export function useDesktopSwipeNavigation(): void {
  const router = useRouter();
  useEffect(() => {
    if (!("zibbyDesktop" in window)) return;
    const detect = createSwipeDetector();
    const onWheel = (e: WheelEvent) => {
      const dir = detect(e);
      if (!dir || canScrollHorizontally(e.target, dir)) return;
      if (dir === "back") router.back();
      else router.forward();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [router]);
}
