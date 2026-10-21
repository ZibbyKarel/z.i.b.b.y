import { act, renderHook } from "@testing-library/react";
import { UiSettingsSchema } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, REVIEW_LAYOUT } from "../grid/presets";
import { compact } from "../grid/layout";
import { useBridgeState } from "./useBridgeState";

const setBridge = vi.fn();
let ui = UiSettingsSchema.parse({});

vi.mock("../../system", () => ({
  useUiSettings: () => ({ ui, setDensity: vi.fn(), setBridge }),
}));

beforeEach(() => {
  setBridge.mockReset();
  ui = UiSettingsSchema.parse({});
});

describe("useBridgeState", () => {
  it("starts on the DEFAULT preset layout", () => {
    const { result } = renderHook(() => useBridgeState());
    expect(result.current.preset).toBe("DEFAULT");
    expect(result.current.layout).toEqual(compact(DEFAULT_LAYOUT));
  });

  it("applyPreset swaps layout + preset and persists", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.applyPreset("REVIEW"));
    expect(result.current.preset).toBe("REVIEW");
    expect(result.current.layout).toEqual(compact(REVIEW_LAYOUT));
    expect(setBridge).toHaveBeenLastCalledWith({
      layout: compact(REVIEW_LAYOUT),
      preset: "REVIEW",
    });
  });

  it("saveAs names layouts MY LAYOUT 01, 02 and selects them", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.saveAs());
    expect(result.current.preset).toBe("MY LAYOUT 01");
    expect(Object.keys(result.current.saved)).toEqual(["MY LAYOUT 01"]);
    act(() => result.current.saveAs());
    expect(Object.keys(result.current.saved)).toEqual(["MY LAYOUT 01", "MY LAYOUT 02"]);
    expect(result.current.preset).toBe("MY LAYOUT 02");
  });

  it("reset returns to DEFAULT", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.applyPreset("REVIEW"));
    act(() => result.current.reset());
    expect(result.current.preset).toBe("DEFAULT");
    expect(result.current.layout).toEqual(compact(DEFAULT_LAYOUT));
  });

  it("a manual move flips the preset to CUSTOM", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.move("issues", { x: 0, y: 3, w: 4, h: 18 }, 1, 0));
    expect(result.current.preset).toBe("CUSTOM");
    expect(setBridge).toHaveBeenLastCalledWith(
      expect.objectContaining({ preset: "CUSTOM", layout: expect.any(Array) }),
    );
  });

  it("add and remove go CUSTOM", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.remove("runs"));
    expect(result.current.layout.some((w) => w.id === "runs")).toBe(false);
    expect(result.current.preset).toBe("CUSTOM");
    act(() => result.current.add("runs"));
    expect(result.current.layout.some((w) => w.id === "runs")).toBe(true);
  });

  it("collapse toggles instantly and persists via setBridge", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.toggleCollapsed("prs"));
    expect(result.current.collapsed).toEqual({ prs: true });
    expect(setBridge).toHaveBeenLastCalledWith({ collapsed: { prs: true } });
    act(() => result.current.setEpicClosed("ZB-1", true));
    expect(setBridge).toHaveBeenLastCalledWith({ epicClosed: { "ZB-1": true } });
  });

  it("Esc closes the selection, then the catalog, then edit mode", () => {
    const { result } = renderHook(() => useBridgeState());
    const esc = () =>
      act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    act(() => result.current.toggleEditing());
    act(() => result.current.toggleCatalog());
    act(() => result.current.setSelection({ kind: "pr", id: "1", widgetId: "prs", key: "pr:1" }));
    esc();
    expect(result.current.selection).toBeNull();
    expect(result.current.catalogOpen).toBe(true);
    esc();
    expect(result.current.catalogOpen).toBe(false);
    expect(result.current.editing).toBe(true);
    esc();
    expect(result.current.editing).toBe(false);
  });
});
