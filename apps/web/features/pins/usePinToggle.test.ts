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

import { usePinToggle } from "./usePinToggle";

describe("usePinToggle", () => {
  beforeEach(() => {
    hooks.mutate.mockReset();
    hooks.pins = [];
  });

  it("isPinned reflects the current list", () => {
    hooks.pins = [{ kind: "agent", id: "researcher" }];
    const { result } = renderHook(() => usePinToggle());
    expect(result.current.isPinned("agent", "researcher")).toBe(true);
    expect(result.current.isPinned("agent", "other")).toBe(false);
    expect(result.current.isPinned("pipeline", "researcher")).toBe(false);
  });

  it("toggling an unpinned target appends it to the mutated list", () => {
    hooks.pins = [{ kind: "agent", id: "researcher" }];
    const { result } = renderHook(() => usePinToggle());
    result.current.toggle("pipeline", "delivery");
    expect(hooks.mutate).toHaveBeenCalledWith({
      body: [
        { kind: "agent", id: "researcher" },
        { kind: "pipeline", id: "delivery" },
      ],
    });
  });

  it("toggling a pinned target removes it from the mutated list", () => {
    hooks.pins = [
      { kind: "agent", id: "researcher" },
      { kind: "chain", id: "research-then-build" },
    ];
    const { result } = renderHook(() => usePinToggle());
    result.current.toggle("agent", "researcher");
    expect(hooks.mutate).toHaveBeenCalledWith({
      body: [{ kind: "chain", id: "research-then-build" }],
    });
  });
});
