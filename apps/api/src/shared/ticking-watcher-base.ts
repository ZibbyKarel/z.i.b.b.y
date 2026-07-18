import type { WatcherHealth, WatcherId } from "@zibby/contracts";
import type { ScopedLogger } from "./logging/logger.service";

/**
 * Shared timer lifecycle + re-entrancy guard for the operator-config-driven
 * `setInterval` watchers (channel-watcher, monitor-watcher, automations/scheduler,
 * tasks/task-scheduler, limits-resume/limit-resume). Each hand-rolled the identical
 * `timer` field + `arm()`/`onModuleDestroy` shape, none guarded against a slow
 * tick's async body outlasting the interval — the next `setInterval` firing then
 * overlaps it and double-processes work (double task dispatch, double reply,
 * status clobber). See `.superpowers/sdd/task-7-scope.md` for the audit findings
 * and per-watcher verification this extraction is based on.
 *
 * **Skip-if-in-flight, not coalesce.** Every one of the 5 ticks is
 * idempotent-catch-up: each independently re-reads its own source of truth
 * (`storage.list()`, `integrations.list()`, `collectDue()`) and processes whatever
 * is due *now*. Nothing queued between ticks is lost by dropping an overlapped
 * firing — the next scheduled tick (or the next `SystemConfigStore.onChange`
 * re-arm) picks up the same due work moments later.
 *
 * **The public `tick()` each concrete service keeps stays UNGUARDED and directly
 * callable** — existing unit tests call `service.tick(fakeNow)` directly and must
 * keep bypassing this guard entirely. The guard sits only on the timer-driven path:
 * `arm()` wires `setInterval` to {@link guardedTick}, which calls the subclass's
 * {@link runTick} (itself just a thin call to the service's own `tick()`).
 *
 * **OnModuleDestroy convention:** this base deliberately does NOT implement
 * `OnModuleDestroy` itself — 3 of the 5 concrete services have their OWN extra
 * teardown (unsubscribing run-status listeners, a `SystemConfigStore.onChange`
 * unsubscribe) alongside the timer, and interface-merging that with a base
 * `OnModuleDestroy` would obscure ordering. Instead this exposes {@link stopTimer},
 * which each concrete service's own `onModuleDestroy()` calls first, then does its
 * own extra cleanup — uniform across all 5, no `super` calls.
 */
export abstract class TickingWatcherBase {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  /** Wall-clock of the last TIMER-driven tick start (F6c). Set at the start of
   * {@link guardedTick} — deliberately NOT in each public `tick()`, so unit tests
   * driving `tick()` directly never need to fabricate a timestamp; the health
   * probe cares about the live timer path only. */
  private lastTickAt: string | null = null;

  /** This watcher's closed-enum id in the `/health` `watchers[]` probe (F6c). */
  protected abstract readonly watcherId: WatcherId;
  /** This tick's poll interval, read fresh from the operator-owned system config. */
  protected abstract tickMs(): number;
  /** The real tick body — each concrete service forwards this to its own public `tick()`. */
  protected abstract runTick(now?: Date): Promise<void>;
  /** Each service supplies its own child `ScopedLogger` (tagged with its class name). */
  protected abstract readonly log: ScopedLogger;

  /** (Re-)arm the timer from {@link tickMs}; `<= 0` leaves it disabled. */
  protected arm(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const ms = this.tickMs();
    if (ms > 0) {
      this.timer = setInterval(() => void this.guardedTick(), ms);
      this.timer.unref?.();
    }
  }

  /** Clear the timer. Called from each concrete service's own `onModuleDestroy()`. */
  protected stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Whether the timer is currently armed — the `/health`-probe "running" meaning. */
  protected isArmed(): boolean {
    return this.timer !== null;
  }

  /**
   * This watcher's heartbeat probe (F6c) — pure read, no side effects. Fail-open by
   * design: `tickMs <= 0` is the intentional test/CI mode (`disabled`, never a
   * fault); armed-but-never-ticked is `ok` (the timers unref, the first tick is
   * imminent); only a last tick older than `staleFactor × tickMs` is `stale` — the
   * genuine "the timer stopped firing" fault. A stale watcher never flips the
   * overall `/health` status to degraded in v1 — it surfaces as a briefing line
   * and a settings-HUD indicator instead.
   */
  watcherHealth(now = Date.now(), staleFactor = 3): WatcherHealth {
    const tickMs = this.tickMs();
    if (tickMs <= 0) return { id: this.watcherId, status: "disabled", tickMs };
    if (this.lastTickAt === null) {
      return { id: this.watcherId, status: "ok", tickMs, detail: "armed, not yet ticked" };
    }
    const ageMs = Math.max(0, now - Date.parse(this.lastTickAt));
    return {
      id: this.watcherId,
      status: ageMs > staleFactor * tickMs ? "stale" : "ok",
      tickMs,
      lastTickAt: this.lastTickAt,
      ageMs,
    };
  }

  /**
   * The timer-driven entry point: skip if a previous tick is still running (logged
   * at debug, never silently swallowed). A throwing tick does NOT kill the timer —
   * the error is logged and `running` is reset in `finally` so the next firing (or a
   * later direct call) proceeds normally. `protected` (not `private`) so the base's
   * own spec can exercise it directly on a trivial concrete subclass without wiring
   * a real timer.
   */
  protected async guardedTick(): Promise<void> {
    if (this.running) {
      this.log.debug("tick skipped — previous tick still in flight");
      return;
    }
    // Stamped at the START (not the end) so a long-running tick counts as alive —
    // staleness means "the timer stopped firing", not "the tick body is slow".
    this.lastTickAt = new Date().toISOString();
    this.running = true;
    try {
      await this.runTick();
    } catch (err) {
      this.log.error("tick threw", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.running = false;
    }
  }
}
