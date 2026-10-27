import { act, renderHook } from "@testing-library/react";
import { UiSettingsSchema } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, REVIEW_LAYOUT } from "../grid/presets";
import { compact } from "../grid/layout";
import { selectionFromParams, useBridgeState } from "./useBridgeState";

const setBridge = vi.fn();
let ui = UiSettingsSchema.parse({});

vi.mock("../../system", () => ({
  useUiSettings: () => ({ ui, setDensity: vi.fn(), setBridge }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/dashboard");
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

  it("starts with REVIEW shown and nothing hidden; legacy favorites are shown too", () => {
    const { result } = renderHook(() => useBridgeState());
    expect(result.current.layouts).toEqual({ shown: ["REVIEW"], hidden: [] });
    ui = UiSettingsSchema.parse({
      bridge: { saved: { A: [], B: [] }, favorites: ["B"] },
    });
    const { result: legacy } = renderHook(() => useBridgeState());
    expect(legacy.current.layouts).toEqual({ shown: ["REVIEW", "B"], hidden: ["A"] });
  });

  it("addLayout copies DEFAULT as the last hidden layout without selecting it", () => {
    const { result } = renderHook(() => useBridgeState());
    let ok = false;
    act(() => void (ok = result.current.addLayout("  Mine ")));
    expect(ok).toBe(true);
    expect(result.current.saved["Mine"]).toEqual(compact(DEFAULT_LAYOUT));
    expect(result.current.layouts).toEqual({ shown: ["REVIEW"], hidden: ["Mine"] });
    expect(result.current.preset).toBe("DEFAULT");
  });

  it("addLayout with a taken or reserved name changes nothing", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => void result.current.addLayout("Mine"));
    setBridge.mockClear();
    let ok = true;
    act(() => void (ok = result.current.addLayout("mine")));
    act(() => void result.current.addLayout("review"));
    expect(ok).toBe(false);
    expect(setBridge).not.toHaveBeenCalled();
    expect(Object.keys(result.current.saved)).toEqual(["Mine"]);
  });

  it("arrange moves layouts between header and dropdown", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => void result.current.addLayout("Mine"));
    act(() => result.current.arrange({ shown: ["Mine"], hidden: ["REVIEW"] }));
    expect(result.current.layouts).toEqual({ shown: ["Mine"], hidden: ["REVIEW"] });
    expect(setBridge).toHaveBeenLastCalledWith({
      arranged: { shown: ["Mine"], hidden: ["REVIEW"] },
    });
  });

  it("deleteLayout of the active layout switches to DEFAULT", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => void result.current.addLayout("Mine"));
    act(() => result.current.applyPreset("Mine"));
    act(() => result.current.deleteLayout("Mine"));
    expect(result.current.saved).toEqual({});
    expect(result.current.preset).toBe("DEFAULT");
    expect(result.current.layout).toEqual(compact(DEFAULT_LAYOUT));
    expect(result.current.layouts).toEqual({ shown: ["REVIEW"], hidden: [] });
  });

  it("REVIEW is deletable and stays gone; DEFAULT is not", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.deleteLayout("REVIEW"));
    expect(result.current.layouts).toEqual({ shown: [], hidden: [] });
    expect(setBridge).toHaveBeenLastCalledWith(expect.objectContaining({ removed: ["REVIEW"] }));
    setBridge.mockClear();
    act(() => result.current.deleteLayout("DEFAULT"));
    expect(setBridge).not.toHaveBeenCalled();
  });

  it("add persists straight into the active layout", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.applyPreset("REVIEW"));
    setBridge.mockClear();
    act(() => result.current.add("teamKb"));
    const saved = setBridge.mock.lastCall?.[0].saved.REVIEW;
    expect(saved.some((w: { type: string }) => w.type === "teamKb")).toBe(true);
    expect(setBridge).toHaveBeenLastCalledWith(expect.objectContaining({ layout: saved }));
    expect(result.current.layout).toEqual(saved);
  });

  it("remove on DEFAULT persists under saved.DEFAULT", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.remove("runs"));
    const saved = setBridge.mock.lastCall?.[0].saved.DEFAULT;
    expect(saved.some((w: { id: string }) => w.id === "runs")).toBe(false);
    expect(result.current.layouts).toEqual({ shown: ["REVIEW"], hidden: [] });
  });

  it("move stays local; endDrag persists", () => {
    const { result } = renderHook(() => useBridgeState());
    const origin = { x: 0, y: 0, w: 4, h: 18 };
    act(() => result.current.beginDrag("issues"));
    act(() => result.current.move("issues", origin, 40, 0));
    expect(setBridge).not.toHaveBeenCalled();
    act(() => result.current.endDrag());
    expect(setBridge).toHaveBeenCalledWith(
      expect.objectContaining({ saved: { DEFAULT: result.current.layout } }),
    );
  });

  it("configure sets one widget's scope and persists", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.applyPreset("REVIEW"));
    act(() => result.current.add("teamKb"));
    const id = result.current.layout.find((w) => w.type === "teamKb")?.id ?? "";
    setBridge.mockClear();
    act(() => result.current.configure(id, { teamId: "t" }));
    expect(result.current.saved["REVIEW"]?.find((w) => w.id === id)?.scope).toEqual({
      teamId: "t",
    });
    expect(setBridge).toHaveBeenCalledTimes(1);
  });

  it("applyPreset always works", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.add("teamKb"));
    act(() => result.current.applyPreset("REVIEW"));
    expect(result.current.preset).toBe("REVIEW");
  });

  it("deleting the active layout falls back to the saved DEFAULT, not the built-in", () => {
    const mine = [{ id: "prs", type: "prs" as const, x: 0, y: 0, w: 4, h: 4 }];
    ui = UiSettingsSchema.parse({ bridge: { saved: { DEFAULT: mine, Mine: [] }, preset: "Mine" } });
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.deleteLayout("Mine"));
    expect(result.current.layout).toEqual(compact(mine));
    expect(setBridge).toHaveBeenLastCalledWith(
      expect.objectContaining({ preset: "DEFAULT", layout: compact(mine) }),
    );
  });

  it("applyPreset drops an in-progress drag layout", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.beginDrag("issues"));
    act(() => result.current.move("issues", { x: 0, y: 3, w: 4, h: 18 }, 4, 0));
    act(() => result.current.applyPreset("REVIEW"));
    expect(result.current.layout).toEqual(compact(REVIEW_LAYOUT));
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
    act(() => result.current.toggleCatalog());
    const ta = document.createElement("textarea");
    const ce = document.createElement("div");
    // jsdom has no isContentEditable; emulate it
    Object.defineProperty(ce, "isContentEditable", { value: true });
    document.body.append(ta, ce);
    for (const el of [ta, ce])
      act(
        () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
      );
    expect(result.current.catalogOpen).toBe(true);
    ta.remove();
    ce.remove();
  });

  it("Esc inside an aria-modal element is ignored; inside a non-modal dialog it closes the selection", () => {
    const { result } = renderHook(() => useBridgeState());
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
    expect(result.current.selection).not.toBeNull();
    esc(sheet);
    expect(result.current.selection).toBeNull();
    modal.remove();
    sheet.remove();
  });

  it("endDrag settles with a final compact only if something moved", () => {
    ui = UiSettingsSchema.parse({
      bridge: {
        saved: {
          X: [
            { id: "issues", type: "issues", x: 0, y: 0, w: 4, h: 4 },
            { id: "prs", type: "prs", x: 0, y: 10, w: 4, h: 4 },
          ],
        },
      },
    });
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.applyPreset("X"));
    act(() => result.current.beginDrag("prs"));
    act(() => result.current.endDrag());
    expect(result.current.draggingId).toBeNull();
    expect(result.current.layout.find((w) => w.id === "prs")?.y).toBe(4);
    expect(result.current.preset).toBe("X");
  });

  it("endDrag on an already compact layout persists nothing", () => {
    const { result } = renderHook(() => useBridgeState());
    act(() => result.current.beginDrag("issues"));
    act(() => result.current.endDrag());
    expect(result.current.preset).toBe("DEFAULT");
    expect(setBridge).not.toHaveBeenCalled();
  });

  it("Esc closes the selection, then the catalog", () => {
    const { result } = renderHook(() => useBridgeState());
    const esc = () =>
      act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    act(() => result.current.toggleCatalog());
    act(() => result.current.setSelection({ kind: "pr", id: "1", widgetId: "prs", key: "pr:1" }));
    esc();
    expect(result.current.selection).toBeNull();
    expect(result.current.catalogOpen).toBe(true);
    esc();
    expect(result.current.catalogOpen).toBe(false);
  });

  it("mirrors the open sheet into the URL and restores it, keeping other params", () => {
    window.history.replaceState(null, "", "/dashboard?company=a");
    const { result } = renderHook(() => useBridgeState());
    const pr = {
      kind: "pr",
      id: "https://github.com/o/r/pull/2",
      widgetId: "prs",
      key: "prs:https://github.com/o/r/pull/2",
    } as const;
    act(() => result.current.setSelection(pr));
    expect(window.location.search).toBe(`?company=a&pull-request=${encodeURIComponent(pr.id)}`);
    expect(renderHook(() => useBridgeState()).result.current.selection).toEqual(pr);
    act(() =>
      result.current.setSelection({ kind: "task", id: "t", widgetId: "tasks", key: "tasks:r" }),
    );
    expect(window.location.search).toBe("?company=a");
    act(() => result.current.closeSelection());
    expect(window.location.search).toBe("?company=a");
  });

  it("selectionFromParams reads issue / run and ignores unknown params", () => {
    expect(selectionFromParams(new URLSearchParams("run=r1"))).toEqual({
      kind: "run",
      id: "r1",
      widgetId: "runs",
      key: "runs:r1",
    });
    expect(selectionFromParams(new URLSearchParams("issue=p1/a"))?.key).toBe("issues:p1/a");
    expect(selectionFromParams(new URLSearchParams("task=t"))).toBeNull();
    expect(selectionFromParams(null)).toBeNull();
  });
});
