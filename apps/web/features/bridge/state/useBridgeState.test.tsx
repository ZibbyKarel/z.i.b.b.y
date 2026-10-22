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

  it("saveAs(Mine) saves the current layout, favorites it and selects it", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.saveAs("  Mine "));
    expect(result.current.preset).toBe("Mine");
    expect(result.current.saved["Mine"]).toEqual(compact(DEFAULT_LAYOUT));
    expect(result.current.favorites).toEqual(["Mine"]);
    expect(result.current.nextName).toBe("MY LAYOUT 01");
  });

  it("saveAs with a taken name changes nothing", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.saveAs("Mine"));
    setBridge.mockClear();
    act(() => result.current.saveAs("mine"));
    expect(setBridge).not.toHaveBeenCalled();
    expect(Object.keys(result.current.saved)).toEqual(["Mine"]);
  });

  it("deleteSaved of the active layout keeps the board and flips to CUSTOM", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.applyPreset("REVIEW"));
    act(() => result.current.saveAs("Mine"));
    act(() => result.current.deleteSaved("Mine"));
    expect(result.current.saved).toEqual({});
    expect(result.current.preset).toBe("CUSTOM");
    expect(result.current.layout).toEqual(compact(REVIEW_LAYOUT));
  });

  it("deleteSaved removes it from favorites", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.saveAs("Mine"));
    act(() => result.current.applyPreset("REVIEW"));
    act(() => result.current.deleteSaved("Mine"));
    expect(result.current.favorites).toEqual([]);
    expect(result.current.preset).toBe("REVIEW");
  });

  it("toggleFavorite adds then removes", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.saveAs("Mine"));
    act(() => result.current.toggleFavorite("Mine"));
    expect(result.current.favorites).toEqual([]);
    act(() => result.current.toggleFavorite("Mine"));
    expect(result.current.favorites).toEqual(["Mine"]);
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

  it("Esc is ignored while typing in an input, textarea or contenteditable", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.toggleEditing());
    const ta = document.createElement("textarea");
    const ce = document.createElement("div");
    // jsdom has no isContentEditable; emulate it
    Object.defineProperty(ce, "isContentEditable", { value: true });
    document.body.append(ta, ce);
    for (const el of [ta, ce])
      act(
        () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
      );
    expect(result.current.editing).toBe(true);
    ta.remove();
    ce.remove();
  });

  it("Esc inside an aria-modal element is ignored; inside a non-modal dialog it closes the selection", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.toggleEditing());
    act(() => result.current.setSelection({ kind: "pr", id: "1", widgetId: "prs", key: "pr:1" }));
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const sheet = document.createElement("div");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "false");
    document.body.append(modal, sheet);
    const esc = (el: HTMLElement) =>
      act(
        () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
      );
    esc(modal);
    expect(result.current.editing).toBe(true);
    expect(result.current.selection).not.toBeNull();
    esc(sheet);
    expect(result.current.selection).toBeNull();
    modal.remove();
    sheet.remove();
  });

  it("endDrag settles with a final compact and flags CUSTOM only if something moved", () => {
    ui = UiSettingsSchema.parse({
      bridge: {
        preset: "X",
        layout: [
          { id: "issues", type: "issues", x: 0, y: 0, w: 4, h: 4 },
          { id: "prs", type: "prs", x: 0, y: 10, w: 4, h: 4 },
        ],
      },
    });
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.beginDrag("prs"));
    act(() => result.current.endDrag());
    expect(result.current.draggingId).toBeNull();
    expect(result.current.layout.find((w) => w.id === "prs")?.y).toBe(4);
    expect(result.current.preset).toBe("CUSTOM");
  });

  it("endDrag on an already compact layout does not re-flag the preset", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.beginDrag("issues"));
    act(() => result.current.endDrag());
    expect(result.current.preset).toBe("DEFAULT");
    expect(setBridge).not.toHaveBeenCalled();
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
