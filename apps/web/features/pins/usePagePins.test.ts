import { renderHook } from "@testing-library/react";
import type { Pins } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { hooks } = vi.hoisted(() => ({
  hooks: { pins: [] as Pins, mutate: vi.fn() },
}));
vi.mock("./queries/usePinsQuery", () => ({ usePinsQuery: () => ({ data: hooks.pins }) }));
vi.mock("./mutations/useSetPinsMutation", () => ({
  useSetPinsMutation: () => ({ mutate: hooks.mutate, isPending: false }),
}));

import { usePagePins } from "./usePagePins";

describe("usePagePins", () => {
  beforeEach(() => {
    hooks.mutate.mockReset();
    hooks.pins = [];
  });

  it("pagePins only surfaces page-kind pins", () => {
    hooks.pins = [
      { kind: "agent", id: "researcher" },
      { kind: "page", id: "/org/people", label: "People" },
    ];
    const { result } = renderHook(() => usePagePins());
    expect(result.current.pagePins).toEqual([{ kind: "page", id: "/org/people", label: "People" }]);
  });

  it("isPagePinned reflects the current list by href", () => {
    hooks.pins = [{ kind: "page", id: "/org/people", label: "People" }];
    const { result } = renderHook(() => usePagePins());
    expect(result.current.isPagePinned("/org/people")).toBe(true);
    expect(result.current.isPagePinned("/org/teams")).toBe(false);
  });

  it("pinPage appends a new page pin to the mutated list", () => {
    hooks.pins = [{ kind: "agent", id: "researcher" }];
    const { result } = renderHook(() => usePagePins());
    result.current.pinPage("/org/people", "People");
    expect(hooks.mutate).toHaveBeenCalledWith({
      body: [
        { kind: "agent", id: "researcher" },
        { kind: "page", id: "/org/people", label: "People" },
      ],
    });
  });

  it("pinPage on an already-pinned href replaces its label", () => {
    hooks.pins = [{ kind: "page", id: "/org/people", label: "People" }];
    const { result } = renderHook(() => usePagePins());
    result.current.pinPage("/org/people", "People (renamed)");
    expect(hooks.mutate).toHaveBeenCalledWith({
      body: [{ kind: "page", id: "/org/people", label: "People (renamed)" }],
    });
  });

  it("unpinPage removes the page pin with that href", () => {
    hooks.pins = [
      { kind: "page", id: "/org/people", label: "People" },
      { kind: "agent", id: "researcher" },
    ];
    const { result } = renderHook(() => usePagePins());
    result.current.unpinPage("/org/people");
    expect(hooks.mutate).toHaveBeenCalledWith({
      body: [{ kind: "agent", id: "researcher" }],
    });
  });
});
