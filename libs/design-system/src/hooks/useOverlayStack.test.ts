import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useOverlayStack } from "./useOverlayStack";

describe("useOverlayStack", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("locks body scroll while active, restores on unmount", () => {
    const { unmount } = renderHook(() => useOverlayStack(true));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("does not lock when active is false", () => {
    renderHook(() => useOverlayStack(false));
    expect(document.body.style.overflow).toBe("");
  });

  it("preserves a pre-existing overflow value instead of resetting to empty string", () => {
    document.body.style.overflow = "auto";
    const { unmount } = renderHook(() => useOverlayStack(true));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("keeps scroll locked while an outer overlay is still active after an inner one unmounts, and the outer is topmost again", () => {
    const outer = renderHook(() => useOverlayStack(true));
    const inner = renderHook(() => useOverlayStack(true));

    expect(outer.result.current.isTopmost()).toBe(false);
    expect(inner.result.current.isTopmost()).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    inner.unmount();

    expect(document.body.style.overflow).toBe("hidden");
    expect(outer.result.current.isTopmost()).toBe(true);

    outer.unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
