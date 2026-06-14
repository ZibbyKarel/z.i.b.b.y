import { describe, expect, it, vi } from "vitest";
import { toastBus } from "./toastBus";

describe("toastBus (43)", () => {
  it("delivers emits to a subscriber (with an id)", () => {
    const fn = vi.fn();
    const unsub = toastBus.subscribe(fn);
    toastBus.emit();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]?.[0]).toHaveProperty("id");
    unsub();
  });

  it("stops delivering after unsubscribe", () => {
    const fn = vi.fn();
    toastBus.subscribe(fn)();
    toastBus.emit();
    expect(fn).not.toHaveBeenCalled();
  });

  it("carries a custom message when provided", () => {
    const fn = vi.fn();
    const unsub = toastBus.subscribe(fn);
    toastBus.emit({ message: "boom" });
    expect(fn.mock.calls[0]?.[0].message).toBe("boom");
    unsub();
  });
});
