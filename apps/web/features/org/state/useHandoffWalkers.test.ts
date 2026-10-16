import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandoffEmployee } from "./deriveHandoffWalkers";
import { WALKER_TTL_MS, useHandoffWalkers } from "./useHandoffWalkers";

const before: HandoffEmployee[] = [
  { id: "a", department: "dev", currentRunId: "r1" },
  { id: "b", department: "qa" },
];
const after: HandoffEmployee[] = [
  { id: "a", department: "dev" },
  { id: "b", department: "qa", currentRunId: "r1" },
];

describe("useHandoffWalkers", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("has no walkers on the first snapshot, adds one on a hand-off, removes on done", () => {
    const { result, rerender } = renderHook(({ e }) => useHandoffWalkers(e), {
      initialProps: { e: before },
    });
    expect(result.current.walkers).toEqual([]);
    rerender({ e: after });
    expect(result.current.walkers.map((w) => w.id)).toEqual(["r1:a->b"]);
    rerender({ e: [...after] });
    expect(result.current.walkers).toHaveLength(1);
    act(() => result.current.onWalkerDone("r1:a->b"));
    expect(result.current.walkers).toEqual([]);
  });

  it("drops a walker nobody acknowledged after the TTL", () => {
    const { result, rerender } = renderHook(({ e }) => useHandoffWalkers(e), {
      initialProps: { e: before },
    });
    rerender({ e: after });
    act(() => {
      vi.advanceTimersByTime(WALKER_TTL_MS + 1);
    });
    expect(result.current.walkers).toEqual([]);
  });
});
