import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCK_STORAGE_KEY, useDockState } from "./useDockState";

describe("useDockState", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts collapsed and persists the active id", () => {
    const { result } = renderHook(() => useDockState());
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]("tasks"));
    expect(result.current[0]).toBe("tasks");
    expect(window.localStorage.getItem(DOCK_STORAGE_KEY)).toBe("tasks");
    act(() => result.current[1](null));
    expect(window.localStorage.getItem(DOCK_STORAGE_KEY)).toBeNull();
  });

  it("hydrates from storage", () => {
    window.localStorage.setItem(DOCK_STORAGE_KEY, "needs-you");
    const { result } = renderHook(() => useDockState());
    expect(result.current[0]).toBe("needs-you");
  });

  it("survives blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useDockState());
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]("pinned"));
    expect(result.current[0]).toBe("pinned");
  });
});
