import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDismissOnOutside } from "./useDismissOnOutside";

describe("useDismissOnOutside", () => {
  const inside = document.createElement("div");
  const outside = document.createElement("div");
  document.body.append(inside, outside);
  const refs = [{ current: inside }];

  afterEach(() => vi.restoreAllMocks());

  it("dismisses once on a pointerdown outside every ref", () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnOutside({ open: true, refs, onDismiss }));
    fireEvent.pointerDown(outside);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores a pointerdown inside a ref", () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnOutside({ open: true, refs, onDismiss }));
    fireEvent.pointerDown(inside);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does nothing while closed", () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnOutside({ open: false, refs, onDismiss }));
    fireEvent.pointerDown(outside);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("removes the listener on unmount", () => {
    const onDismiss = vi.fn();
    const { unmount } = renderHook(() => useDismissOnOutside({ open: true, refs, onDismiss }));
    unmount();
    fireEvent.pointerDown(outside);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("calls the latest onDismiss without re-subscribing", () => {
    const add = vi.spyOn(document, "addEventListener");
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onDismiss }) => useDismissOnOutside({ open: true, refs, onDismiss }),
      { initialProps: { onDismiss: first } },
    );
    rerender({ onDismiss: second });
    fireEvent.pointerDown(outside);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(add.mock.calls.filter(([type]) => type === "pointerdown")).toHaveLength(1);
  });
});
