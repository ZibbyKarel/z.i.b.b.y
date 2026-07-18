import { describe, expect, it, vi } from "vitest";
import type { ScopedLogger } from "./logging/logger.service";
import { TickingWatcherBase } from "./ticking-watcher-base";

/** A trivial concrete subclass exercising the base's guard generically, once,
 * instead of repeating the mechanism in all 5 service spec files. */
class TestWatcher extends TickingWatcherBase {
  readonly log: ScopedLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  protected readonly watcherId = "channel" as const;
  private ms = 0;
  private body: () => Promise<void> = async () => {};

  setTickMs(ms: number): void {
    this.ms = ms;
  }

  setBody(fn: () => Promise<void>): void {
    this.body = fn;
  }

  protected tickMs(): number {
    return this.ms;
  }

  protected async runTick(): Promise<void> {
    await this.body();
  }

  /** Expose the base's protected timer-driven entry point for direct invocation. */
  fireGuardedTick(): Promise<void> {
    return this.guardedTick();
  }

  /** Expose `arm`/`stopTimer` for the timer-lifecycle test below. */
  armPublic(): void {
    this.arm();
  }
  stopTimerPublic(): void {
    this.stopTimer();
  }
  isArmedPublic(): boolean {
    return this.isArmed();
  }
}

describe("TickingWatcherBase", () => {
  it("skips a second guarded tick while the first is still in flight (skip-if-in-flight)", async () => {
    const watcher = new TestWatcher();
    const started = vi.fn();
    let resolveFirst: () => void = () => {};
    const deferred = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    watcher.setBody(async () => {
      started();
      await deferred;
    });

    // Simulate two setInterval firings in quick succession: the first starts and
    // blocks on the deferred promise; the second must be dropped immediately (not
    // queued, not coalesced) rather than waiting for the first to finish.
    const first = watcher.fireGuardedTick();
    const second = watcher.fireGuardedTick();
    await second; // the skipped call resolves right away
    expect(started).toHaveBeenCalledTimes(1); // the body ran once, not twice

    resolveFirst();
    await first;
    expect(started).toHaveBeenCalledTimes(1); // still once — the second never ran the body

    // Once the first has finished, the guard is free again for a later firing.
    const third = watcher.fireGuardedTick();
    await third;
    expect(started).toHaveBeenCalledTimes(2);
  });

  it("a throwing tick does not kill the timer — running resets in finally so a later call proceeds", async () => {
    const watcher = new TestWatcher();
    let callCount = 0;
    watcher.setBody(async () => {
      callCount += 1;
      if (callCount === 1) throw new Error("boom");
    });

    await watcher.fireGuardedTick(); // throws internally; caught + logged, not rethrown
    expect(callCount).toBe(1);
    expect(watcher.log.error).toHaveBeenCalledWith(
      "tick threw",
      expect.objectContaining({ error: "boom" }),
    );

    // Not permanently "stuck running" — the finally block reset the flag.
    await watcher.fireGuardedTick();
    expect(callCount).toBe(2);
  });

  it("arm() creates a real interval that fires guardedTick, and tickMs <= 0 disables it", () => {
    vi.useFakeTimers();
    try {
      const watcher = new TestWatcher();
      const ticked = vi.fn();
      watcher.setBody(async () => {
        ticked();
      });

      watcher.setTickMs(0);
      watcher.armPublic();
      expect(watcher.isArmedPublic()).toBe(false);

      watcher.setTickMs(1000);
      watcher.armPublic();
      expect(watcher.isArmedPublic()).toBe(true);

      vi.advanceTimersByTime(1000);
      expect(ticked).toHaveBeenCalledTimes(1);

      watcher.stopTimerPublic();
      expect(watcher.isArmedPublic()).toBe(false);
      vi.advanceTimersByTime(5000);
      expect(ticked).toHaveBeenCalledTimes(1); // no further firings once stopped
    } finally {
      vi.useRealTimers();
    }
  });

  describe("watcherHealth (F6c)", () => {
    it("tickMs <= 0 → disabled (the intentional test/CI mode, never a fault)", () => {
      const watcher = new TestWatcher();
      watcher.setTickMs(0);
      expect(watcher.watcherHealth()).toEqual({ id: "channel", status: "disabled", tickMs: 0 });
    });

    it("armed but never ticked → ok with the 'not yet ticked' detail (fail-open)", () => {
      const watcher = new TestWatcher();
      watcher.setTickMs(1000);
      expect(watcher.watcherHealth()).toEqual({
        id: "channel",
        status: "ok",
        tickMs: 1000,
        detail: "armed, not yet ticked",
      });
    });

    it("a guardedTick stamps lastTickAt and a fresh probe reports ok with ageMs", async () => {
      const watcher = new TestWatcher();
      watcher.setTickMs(1000);
      await watcher.fireGuardedTick();
      const health = watcher.watcherHealth();
      expect(health.status).toBe("ok");
      expect(health.lastTickAt).toBeDefined();
      expect(health.ageMs).toBeGreaterThanOrEqual(0);
      expect(health.ageMs).toBeLessThan(3000);
    });

    it("a last tick older than staleFactor × tickMs probes stale with its age", async () => {
      const watcher = new TestWatcher();
      watcher.setTickMs(1000);
      await watcher.fireGuardedTick();
      const health = watcher.watcherHealth(Date.now() + 60_000); // 60 s later > 3×1 s
      expect(health.status).toBe("stale");
      expect(health.ageMs).toBeGreaterThan(3000);
      expect(health.lastTickAt).toBeDefined();
    });

    it("a direct (test-driven) tick does NOT stamp lastTickAt — only the timer path does", async () => {
      const watcher = new TestWatcher();
      watcher.setTickMs(1000);
      // runTick directly — the ungated public-tick path unit tests use.
      await (watcher as unknown as { runTick(): Promise<void> }).runTick();
      expect(watcher.watcherHealth().detail).toBe("armed, not yet ticked");
    });
  });
});
