import { describe, expect, it, vi } from "vitest";
import type { WatcherHealth } from "@zibby/contracts";
import { WatcherHealthRegistry } from "./watcher-health.registry";

const warn = vi.fn();
const fakeLogger = { child: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }) };

function probe(
  id: WatcherHealth["id"],
  status: WatcherHealth["status"] = "ok",
): () => WatcherHealth {
  return () => ({ id, status, tickMs: 1000 });
}

describe("WatcherHealthRegistry (F6c)", () => {
  it("register two probes → all() returns both snapshots", () => {
    const registry = new WatcherHealthRegistry(fakeLogger as never);
    registry.register(probe("channel"));
    registry.register(probe("monitor", "stale"));
    expect(registry.all()).toEqual([
      { id: "channel", status: "ok", tickMs: 1000 },
      { id: "monitor", status: "stale", tickMs: 1000 },
    ]);
  });

  it("a throwing probe is dropped with a warning, never fatal (fail-open)", () => {
    const registry = new WatcherHealthRegistry(fakeLogger as never);
    registry.register(probe("channel"));
    registry.register(() => {
      throw new Error("probe boom");
    });
    registry.register(probe("scheduler"));
    expect(registry.all()).toEqual([
      { id: "channel", status: "ok", tickMs: 1000 },
      { id: "scheduler", status: "ok", tickMs: 1000 },
    ]);
    expect(warn).toHaveBeenCalledWith(
      "watcher health probe threw — dropped (fail-open)",
      expect.objectContaining({ error: "probe boom" }),
    );
  });

  it("all() on an empty registry is just []", () => {
    expect(new WatcherHealthRegistry(fakeLogger as never).all()).toEqual([]);
  });
});
