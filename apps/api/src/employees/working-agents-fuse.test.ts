import { describe, expect, it, vi } from "vitest";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { WorkingAgentsFuse } from "./working-agents-fuse";

/** True when `p` has not settled after a macrotask flush. */
async function stillPending(p: Promise<unknown>): Promise<boolean> {
  const PENDING = Symbol("pending");
  const result = await Promise.race([p, new Promise((r) => setTimeout(() => r(PENDING), 0))]);
  return result === PENDING;
}

describe("WorkingAgentsFuse", () => {
  const make = (cap = 1) => {
    const store = fakeSystemConfigStore({ maxWorkingAgents: cap });
    return { store, fuse: new WorkingAgentsFuse(store) };
  };

  it("tryTake grants up to the cap, then returns null", () => {
    const { fuse } = make(1);
    expect(fuse.tryTake()).not.toBeNull();
    expect(fuse.tryTake()).toBeNull();
    expect(fuse.inUse()).toBe(1);
    expect(fuse.hasRoom()).toBe(false);
  });

  it("take waits until a slot is released", async () => {
    const { fuse } = make(1);
    const first = fuse.tryTake()!;
    const second = fuse.take();
    expect(await stillPending(second)).toBe(true);
    first();
    await expect(second).resolves.toBeTypeOf("function");
    expect(fuse.inUse()).toBe(1);
  });

  it("a double release is a no-op — inUse never goes negative", () => {
    const { fuse } = make(1);
    const slot = fuse.tryTake()!;
    slot();
    slot();
    expect(fuse.inUse()).toBe(0);
  });

  it("grants the higher-progress waiter first", async () => {
    const { fuse } = make(1);
    const first = fuse.tryTake()!;
    const order: string[] = [];
    const fresh = fuse.take({ progress: 0 }).then(() => order.push("fresh"));
    const advanced = fuse.take({ progress: 0.5 }).then(() => order.push("advanced"));
    first();
    await advanced;
    expect(order).toEqual(["advanced"]);
    expect(await stillPending(fresh)).toBe(true);
  });

  it("raising the cap admits a waiter immediately", async () => {
    const { store, fuse } = make(1);
    fuse.tryTake();
    const waiting = fuse.take();
    await store.write({ ...store.current(), maxWorkingAgents: 2 });
    await expect(waiting).resolves.toBeTypeOf("function");
    expect(fuse.inUse()).toBe(2);
  });

  it("onFreed fires after a release that leaves room", () => {
    const { fuse } = make(1);
    const freed = vi.fn();
    const unsubscribe = fuse.onFreed(freed);
    const slot = fuse.tryTake()!;
    slot();
    expect(freed).toHaveBeenCalledTimes(1);
    unsubscribe();
    fuse.tryTake()!();
    expect(freed).toHaveBeenCalledTimes(1);
  });
});
