import { describe, expect, it, vi } from "vitest";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { RunSlots } from "./run-slots.service";

describe("RunSlots", () => {
  const make = (cap = 1) => {
    const store = fakeSystemConfigStore({ maxConcurrentRuns: cap });
    return { store, slots: new RunSlots(store) };
  };

  it("tryTake grants up to the global cap, then returns null", () => {
    const { slots } = make(1);
    expect(slots.tryTake()).not.toBeNull();
    expect(slots.tryTake()).toBeNull();
    expect(slots.inUse()).toBe(1);
    expect(slots.hasRoom()).toBe(false);
  });

  it("a double release is a no-op — inUse never goes negative", () => {
    const { slots } = make(1);
    const slot = slots.tryTake("p1")!;
    slot();
    slot();
    expect(slots.inUse()).toBe(0);
    expect(slots.inUse("p1")).toBe(0);
  });

  it("enforces the per-project cap without blocking other projects", () => {
    const { slots } = make(10);
    expect(slots.tryTake("p1", 1)).not.toBeNull();
    expect(slots.tryTake("p1", 1)).toBeNull();
    expect(slots.tryTake("p2", 1)).not.toBeNull();
    expect(slots.tryTake(undefined)).not.toBeNull();
    expect(slots.inUse()).toBe(3);
  });

  it("a project without a cap is bounded only by the global cap", () => {
    const { slots } = make(2);
    expect(slots.tryTake("p1")).not.toBeNull();
    expect(slots.tryTake("p1")).not.toBeNull();
    expect(slots.tryTake("p1")).toBeNull();
  });

  it("notifies onFreed on release and on a cap change", async () => {
    const { store, slots } = make(1);
    const freed = vi.fn();
    slots.onFreed(freed);
    const slot = slots.tryTake()!;
    slot();
    expect(freed).toHaveBeenCalledTimes(1);
    await store.write({ ...store.current(), maxConcurrentRuns: 2 });
    expect(freed).toHaveBeenCalledTimes(2);
  });
});
