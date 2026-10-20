import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionFlags } from "./useSessionFlags";

describe("useSessionFlags", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts empty, sets a flag and persists it for the session", () => {
    const { result, unmount } = renderHook(() => useSessionFlags("k"));
    expect(result.current[0]).toEqual({});
    act(() => result.current[1]("a", true));
    expect(result.current[0]).toEqual({ a: true });
    unmount();
    const again = renderHook(() => useSessionFlags("k"));
    expect(again.result.current[0]).toEqual({ a: true });
  });

  it("ignores corrupt JSON", () => {
    window.sessionStorage.setItem("k", "{not json");
    const { result } = renderHook(() => useSessionFlags("k"));
    expect(result.current[0]).toEqual({});
  });

  it("survives a throwing sessionStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = renderHook(() => useSessionFlags("k"));
    expect(result.current[0]).toEqual({});
    act(() => result.current[1]("a", true));
    expect(result.current[0]).toEqual({ a: true });
  });

  it("two hook instances never overwrite each other's ids", () => {
    const a = renderHook(() => useSessionFlags<string>("k"));
    const b = renderHook(() => useSessionFlags<string>("k"));
    act(() => a.result.current[1]("pr-a", "tested"));
    act(() => b.result.current[1]("pr-b", "browser"));
    expect(JSON.parse(window.sessionStorage.getItem("k") ?? "{}")).toEqual({
      "pr-a": "tested",
      "pr-b": "browser",
    });
  });
});
