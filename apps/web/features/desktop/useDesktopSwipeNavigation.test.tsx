import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { back, forward } = vi.hoisted(() => ({ back: vi.fn(), forward: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back, forward }) }));

import { canScrollHorizontally, useDesktopSwipeNavigation } from "./useDesktopSwipeNavigation";

function setDesktop(on: boolean) {
  if (on) Object.defineProperty(window, "zibbyDesktop", { value: {}, configurable: true });
  else Reflect.deleteProperty(window, "zibbyDesktop");
}

function swipe(target: Element, deltaX: number, count = 10) {
  for (let i = 0; i < count; i++) {
    target.dispatchEvent(new WheelEvent("wheel", { deltaX, bubbles: true }));
  }
}

function scroller(scrollLeft: number) {
  const el = document.createElement("div");
  el.style.overflowX = "auto";
  Object.defineProperty(el, "scrollWidth", { value: 500 });
  Object.defineProperty(el, "clientWidth", { value: 100 });
  el.scrollLeft = scrollLeft;
  const child = document.createElement("span");
  el.appendChild(child);
  document.body.appendChild(el);
  return { el, child };
}

afterEach(() => {
  setDesktop(false);
  back.mockClear();
  forward.mockClear();
  document.body.innerHTML = "";
});

describe("useDesktopSwipeNavigation (todo-6)", () => {
  it("navigates back once on a leftward swipe in the desktop app", () => {
    setDesktop(true);
    renderHook(() => useDesktopSwipeNavigation());
    swipe(document.body, -15);
    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).not.toHaveBeenCalled();
  });

  it("navigates forward once on a rightward swipe", () => {
    setDesktop(true);
    renderHook(() => useDesktopSwipeNavigation());
    swipe(document.body, 15);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it("does nothing in a plain browser", () => {
    renderHook(() => useDesktopSwipeNavigation());
    swipe(document.body, -15);
    expect(back).not.toHaveBeenCalled();
    expect(forward).not.toHaveBeenCalled();
  });

  it("lets a horizontally scrollable element scroll instead of navigating", () => {
    setDesktop(true);
    renderHook(() => useDesktopSwipeNavigation());
    swipe(scroller(50).child, -15);
    expect(back).not.toHaveBeenCalled();
  });

  it("stops listening on unmount", () => {
    setDesktop(true);
    const { unmount } = renderHook(() => useDesktopSwipeNavigation());
    unmount();
    swipe(document.body, -15);
    expect(back).not.toHaveBeenCalled();
  });
});

describe("canScrollHorizontally", () => {
  it("back needs scrollLeft > 0", () => {
    expect(canScrollHorizontally(scroller(0).child, "back")).toBe(false);
    expect(canScrollHorizontally(scroller(1).child, "back")).toBe(true);
  });

  it("forward needs room to the right", () => {
    expect(canScrollHorizontally(scroller(0).child, "forward")).toBe(true);
    expect(canScrollHorizontally(scroller(400).child, "forward")).toBe(false);
  });

  it("is false for non-scrollable targets and null", () => {
    expect(canScrollHorizontally(document.body, "back")).toBe(false);
    expect(canScrollHorizontally(null, "back")).toBe(false);
  });
});
