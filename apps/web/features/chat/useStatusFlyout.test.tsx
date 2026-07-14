import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE_GRACE_MS } from "./statusFlyout";
import { useStatusFlyout } from "./useStatusFlyout";

describe("useStatusFlyout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens instantly and swaps sections instantly", () => {
    const { result } = renderHook(() => useStatusFlyout());
    expect(result.current.open).toBe(false);
    act(() => result.current.openTo("working"));
    expect(result.current.activeSection).toBe("working");
    act(() => result.current.openTo("waiting"));
    expect(result.current.activeSection).toBe("waiting");
  });

  it("closes only after the full 200ms grace", () => {
    const { result } = renderHook(() => useStatusFlyout());
    act(() => result.current.openTo("working"));
    act(() => result.current.scheduleClose());
    act(() => vi.advanceTimersByTime(CLOSE_GRACE_MS - 1));
    expect(result.current.open).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.open).toBe(false);
  });

  it("cancelClose and openTo both abort a pending close", () => {
    const { result } = renderHook(() => useStatusFlyout());
    act(() => result.current.openTo("working"));
    act(() => result.current.scheduleClose());
    act(() => result.current.cancelClose());
    act(() => vi.advanceTimersByTime(CLOSE_GRACE_MS * 2));
    expect(result.current.open).toBe(true);

    act(() => result.current.scheduleClose());
    act(() => result.current.openTo("waiting"));
    act(() => vi.advanceTimersByTime(CLOSE_GRACE_MS * 2));
    expect(result.current.activeSection).toBe("waiting");
  });

  it("close() is immediate and clears any pending timer", () => {
    const { result } = renderHook(() => useStatusFlyout());
    act(() => result.current.openTo("waiting"));
    act(() => result.current.scheduleClose());
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    act(() => vi.advanceTimersByTime(CLOSE_GRACE_MS * 2));
    expect(result.current.open).toBe(false);
  });
});
