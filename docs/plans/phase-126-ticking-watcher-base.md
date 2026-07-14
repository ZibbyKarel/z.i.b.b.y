# Phase 126 — `TickingWatcherBase`: re-entrancy guard for the 5 `setInterval` watchers

> `docs/audit/report-final.md:36` (systemic problem #5): _"Paralelně: 5 `setInterval` watcherů
> (channel, monitor, automations, task-scheduler, limit-resume) nemá re-entrancy guard → překryv
> ticků → dvojité zpracování/dispatch. [...] Oboje volá po sdílené base třídě ([...]
> `TickingWatcherBase`)."_
>
> `docs/audit/report-final.md:95`: _`channels/channel-watcher.service.ts:80,178` — Tick bez
> re-entrancy guard → dvojí dispatch; triage failure natrvalo uvízne zprávu ve `new`. →
> **isTicking guard; per-tick sweep `new`-items.**_
>
> `docs/audit/report-final.md:102`: _`automations/scheduler.service.ts:52,96` — Tick bez
> re-entrancy + loop bez try/catch (jedna chyba zastaví všechny pozdější). →
> **isTicking guard + per-automation try/catch.**_
>
> `docs/audit/report-final.md:117` (cross-cutting #4): _"Extrahovat `TickingWatcherBase` (timer
> lifecycle + busy-guard) — re-entrancy fix pro 5 watcherů jednou."_
>
> `docs/audit/batches/api-monitors-events-discovery.md:19-21`: _"Five separate services
> independently hand-roll the same `setInterval` + arm()/onModuleInit/onModuleDestroy +
> `SystemConfigStore.onChange` re-arm pattern, each with its own (missing) re-entrancy handling —
> no shared base class. (KLÍČOVÝ cross-cutting nález.)"_

## Recon (verified)

All 5 watchers are `@Injectable() implements OnModuleInit, OnModuleDestroy` and share an
**identical, independently hand-rolled** skeleton: a `private timer` field, an `arm()` that
`clearInterval`s any existing timer then re-`setInterval`s off a live `SystemConfigStore` field
(`0` disables), `timer.unref?.()` so the loop doesn't keep the process alive, `onModuleInit` calls
`arm()` once and subscribes to `systemConfig.onChange(() => this.arm())` for live re-arm, and
`onModuleDestroy` clears the timer and unsubscribes. **None of the five guards against the next
timer firing while the previous tick's async work is still in flight.**

| Watcher | File | `arm()`/`setInterval` | `onModuleInit`/`onModuleDestroy` | `tick()` | Guard today | Extra bug |
|---|---|---|---|---|---|---|
| Channel watcher | `apps/api/src/channels/channel-watcher.service.ts` | L72-86, `setInterval` L80, `channelTickMs` (default 30s, dev 3000ms) | L66-70 / L88-91 | L94-129, `async tick(): Promise<string[]>` | **none** | Triage failure on a `new` item is caught (L178) and left `state:"new"` "to retry next tick" — but nothing ever re-scans lingering `new` items, only freshly-polled ones. Stranded forever. |
| Monitor watcher | `apps/api/src/monitors/monitor-watcher.service.ts` | L54-67, `setInterval` L61, `monitorTickMs` (default 60s) | L48-51 / L69-72 | L75-102, `async tick(): Promise<string[]>` | **none** | None — already calls `retryUnhandled()` (L188-192) at the top of every tick, sweeping all `state:"new"` events. Keep this behavior when migrating (it's the pattern channel-watcher is missing). |
| Automations scheduler | `apps/api/src/automations/scheduler.service.ts` | L60-75, `setInterval` L68, `automationTickMs` (default 0 = disabled) | L52-57 / L77-80 | L92-110, `async tick(now = new Date()): Promise<string[]>` | **none** | The `for (const automation of ...)` loop (L96-107) has **no try/catch** around `this.fire()` — a thrown error inside one automation's dispatch propagates out of `tick()` and stops the loop; every automation later in iteration order silently doesn't fire that minute. |
| Task scheduler | `apps/api/src/tasks/task-scheduler.service.ts` | L208-221, `setInterval` L215, `taskTickMs` (default 30s) | L169-205 (also `OnApplicationBootstrap`) / L255-258 | L445-493, `async tick(now = new Date()): Promise<string[]>` | **none** | None — already wraps each fired task in its own `trace.run` + try/catch (L452-489) with retry/backoff/dead-letter. Highest migration risk anyway: `onModuleInit` also wires 4 runners' `onRunStatus` subscriptions and registers the `task` approvals resumer (L173-199), not just the timer. |
| Limit-resume | `apps/api/src/limits-resume/limit-resume.service.ts` | L61-77, `setInterval` L68, `limitResumeTickMs` (default 60s) | L54-58 / L79-82 | L85-117, `async tick(now = new Date()): Promise<void>` | **none at tick level** — but a per-run `inflight` `Set<string>` guard (L165-179, `guard()`) already prevents the *same run* from being double-resumed inside or across overlapping ticks | None extra, but an overlapping tick weakens the thundering-herd guard: `resumedThisTick` (L90, L110, L114) is a local variable scoped to one `tick()` call, so two overlapping ticks each get their own `resumedThisTick = false` and can both resume a run when the window only has headroom for one. |

**The overlap window (confirmed by reading, not measured):** every `arm()` reads its interval from
`SystemConfigStore` (dev defaults 3s for channels, 30-60s for the rest) and fires
`setInterval(() => void this.tick(), tickMs)` — a fire-and-forget async call. `tick()` does at
least one `await` per integration/automation/task (network I/O, an LLM triage spawn taking ~8s for
channels, a claude-cli run for monitor dispatch). Any tick whose total async work exceeds `tickMs`
is still running when the next timer fires; nothing stops the second `tick()` from starting. This
is confirmed structurally (no `isTicking`/mutex anywhere in any of the 5 files — verified by
reading each file above and by `grep -rn "isTicking" apps/api/src` returning nothing) — the actual
overlap being *hit* in production depends on load and isn't independently measured here.

Confirmed vs. assumed:
- **Confirmed**: exact line numbers/shapes above, all five follow the identical arm/timer/onChange
  skeleton, none has a busy-guard, the two extra bugs (channel stuck-`new`, automations
  no-per-item-try/catch) exist as described.
- **Confirmed**: task-scheduler's and limit-resume's `tick()` already isolate *some* failures
  (per-item try/catch in task-scheduler; per-run try/catch in limit-resume's `guard()`) — these
  are NOT broken, just need the tick-level busy-guard layered on top without disturbing them.
- **Assumed**: that overlapping ticks have actually caused a double-dispatch in production — no
  log/incident evidence was reviewed, only the code-level race condition.

`SystemConfigStore` (`apps/api/src/system/system-config.store.ts:72`, `onChange`) and the five
`*TickMs` fields (`libs/contracts/src/system/system.schema.ts:17-25`) are unchanged by this phase.

## Goal

A shared `TickingWatcherBase` gives all five services, from one place:
- an `isTicking` busy-guard — a tick that is still running when the timer fires again is skipped
  (logged at `debug`), never overlapped;
- the identical timer lifecycle (arm/re-arm on `SystemConfigStore.onChange`, `unref()`, clean
  `onModuleDestroy`) they already hand-roll, now written once;
- a tick that throws is caught, logged at `warn`, and never crashes the loop or propagates past
  the base — matching the intent already present ad hoc in task-scheduler/limit-resume, now
  guaranteed for all five;

plus two small behavioral fixes riding along with the migration (both already scoped by the
audit's own recommendation column):
- the **channel watcher** sweeps all lingering `state:"new"` items at the top of every tick (mirror
  monitor-watcher's existing `retryUnhandled()`), so a triage failure is retried, not stranded
  forever;
- the **automations loop** wraps each automation's `fire()` in its own try/catch, so one throwing
  automation no longer silently blocks every automation later in that tick's iteration order.

Out of scope (explicitly not this phase): `withPathLock` around `markFired`/ledger writes (a
separate lost-update finding, `docs/audit/report-final.md:32`), monitor-watcher's
`retryUnhandled()` backoff/attempt-cap (Low, unrelated), and the `putNew`/`put` dedup TOCTOU noted
alongside re-entrancy in both channel and monitor batches (a storage-layer atomicity fix, not a
watcher-timer fix — the busy-guard shrinks but does not close that window).

## Approach

1. **Design `TickingWatcherBase<TResult>`, `apps/api/src/shared/watchers/ticking-watcher-base.ts`**
   (new `shared/watchers/` folder, mirroring the existing `shared/file-storage/` — a cohesive
   concept gets its own subfolder, not a loose file in `shared/`).

   ```ts
   export abstract class TickingWatcherBase<TResult>
     implements OnModuleInit, OnModuleDestroy
   {
     private timer: ReturnType<typeof setInterval> | null = null;
     private configUnsubscribe: (() => void) | null = null;
     private isTicking = false;
     protected readonly log: ScopedLogger;

     protected constructor(
       private readonly watcherLabel: string,
       protected readonly systemConfig: SystemConfigStore,
       logger: LoggerService,
     ) {
       this.log = logger.child(this.constructor.name);
     }

     /** Read the live interval off systemConfig each arm; `<= 0` disables. */
     protected abstract currentIntervalMs(): number;
     /** The actual per-tick work. Never called re-entrantly. */
     protected abstract doTick(now: Date): Promise<TResult>;
     /** Returned when a tick is skipped (busy) or throws — must be a safe "did nothing" value
      *  (e.g. `[]` for the id-array watchers, `undefined` for the void ones). */
     protected abstract readonly emptyResult: TResult;

     onModuleInit(): void {
       this.armTicking();
       this.configUnsubscribe = this.systemConfig.onChange(() => this.armTicking());
     }
     onModuleDestroy(): void {
       this.disarmTicking();
       this.configUnsubscribe?.();
     }
     /** Exposed so a subclass with extra onModuleInit/Destroy work calls super.*() and so
      *  SchedulerService.health() can still report `running: this.armed`. */
     protected get armed(): boolean {
       return this.timer !== null;
     }
     protected armTicking(): void {
       this.disarmTicking();
       const ms = this.currentIntervalMs();
       if (ms > 0) {
         this.timer = setInterval(() => void this.tick(), ms);
         this.timer.unref?.();
         this.log.info(`${this.watcherLabel} started`, { tickMs: ms });
       } else {
         this.log.debug(`${this.watcherLabel} tick disabled`);
       }
     }
     protected disarmTicking(): void {
       if (this.timer) {
         clearInterval(this.timer);
         this.timer = null;
       }
     }

     /** Public — timer-driven AND directly callable (existing tests call `watcher.tick()`).
      *  Busy-guard: skip silently (debug-logged) rather than overlap. A thrown doTick is
      *  caught, warn-logged, and never propagates. */
     async tick(now: Date = new Date()): Promise<TResult> {
       if (this.isTicking) {
         this.log.debug(`${this.watcherLabel} tick skipped — previous tick still running`);
         return this.emptyResult;
       }
       this.isTicking = true;
       try {
         return await this.doTick(now);
       } catch (err) {
         this.log.warn(`${this.watcherLabel} tick failed`, {
           error: err instanceof Error ? err.message : String(err),
         });
         return this.emptyResult;
       } finally {
         this.isTicking = false;
       }
     }
   }
   ```

   Design notes:
   - `tick(now: Date = new Date())` is normalized across all five, even for channel/monitor
     watchers whose `doTick` ignores `now` — keeps the base's single timer call site
     (`setInterval(() => void this.tick(), ms)`) uniform and existing zero-arg test call sites
     (`watcher.tick()`) unchanged.
   - The base owns `onModuleInit`/`onModuleDestroy` fully for the 4 simple watchers (channel,
     monitor, automations, limit-resume) — they don't override them at all. Task-scheduler
     overrides both, calling `super.onModuleInit()` / `super.onModuleDestroy()` alongside its
     extra runner-subscription/approvals-registration work (see step 2).
   - Swallowing a thrown `doTick` at the base level is a **behavior change** for task-scheduler:
     today an exception from `storage.list()` itself (before the per-item loop) would propagate
     out of `tick()` uncaught; after this change it's caught, logged, and the tick returns `[]`.
     This is strictly safer (a tick can never crash the interval) — call it out in the PR
     description, not hidden.

2. **Migrate one watcher first as the proof, then the rest — in ascending risk order:**
   monitor-watcher → limit-resume → channel-watcher (folds in the stuck-`new` fix) →
   automations/scheduler (folds in the per-item try/catch fix) → task-scheduler (highest risk,
   `OnApplicationBootstrap` + extra `onModuleInit` wiring, migrate last with the others' pattern
   already proven).

   Each migration: `extends TickingWatcherBase<TResult>`, delete the hand-rolled `timer`/`arm`/
   `onModuleInit`/`onModuleDestroy`, implement `currentIntervalMs()` (the one-line
   `systemConfig.current().xTickMs` read), `emptyResult`, and rename the existing tick body to
   `protected async doTick(now: Date): Promise<TResult>` (drop the `now` param from the signature
   where it's currently unused, or keep threading it through where already used — automations and
   limit-resume already take `now`, keep it; channel/monitor drop it from their internal logic but
   the override signature still matches `doTick(now: Date)`).

   - `SchedulerService.health()` (automations, `scheduler.service.ts:87-89`) reads `this.timer !==
     null` today — becomes `this.armed` (the base's protected getter). `lastTickAt`/`tickMs`
     bookkeeping stays local to `SchedulerService` (not generic enough to hoist).
   - Task-scheduler's `onModuleInit` keeps its `onRunStatus` subscriptions and
     `approvals.register("task", ...)` (L173-199), then calls `super.onModuleInit()` in place of
     its own `this.arm(); this.unsubscribes.push(this.systemConfig.onChange(...))` (L203-204).
     `onModuleDestroy` keeps its `unsubscribes.forEach(...)` loop, adding `super.onModuleDestroy()`
     in place of its own `if (this.timer) clearInterval(this.timer)` (L255-258).

3. **Channel watcher — per-tick sweep of stranded `new` items**, folded into its `doTick`
   migration (`channel-watcher.service.ts`). Mirror monitor-watcher's existing
   `retryUnhandled()` (L188-192): add a method that lists `state:"new"` items via
   `ChannelItemStore` (check for an existing `listFiltered`/`list({state:"new"})` accessor —
   `ChannelItemStore` likely needs the same filtered-list method `MonitorEventStore` already has;
   add it if missing) and re-`this.flow.handle(item)`s each at the top of `doTick`, alongside the
   existing `sweepOutcomes()` call (L97-99). Keep the existing per-item catch (L178-185) — the
   sweep just means a stuck item gets *retried* next tick instead of never being looked at again.

4. **Automations scheduler — per-automation try/catch**, folded into its `doTick` migration
   (`scheduler.service.ts:96-107`). Wrap the body of the `for` loop (the `matchesCron` check
   through `this.fire(...)`) in try/catch; on a thrown error, `log.warn` with the automation id and
   `continue` to the next automation — mirror the pattern task-scheduler's `tick()` already uses
   per-task (L452-489), scaled down (no retry/backoff/dead-letter needed here, just isolation —
   `markFired` not being called on a failed fire means it stays eligible to retry next matching
   minute, which is the existing at-least-once behavior for a fire that never got to `markFired`
   today too).

## Testing

- New `apps/api/src/shared/watchers/ticking-watcher-base.test.ts` — a minimal concrete subclass
  under test:
  - A `doTick` that doesn't resolve until released: fire the timer twice inside one interval
    period (or call `tick()` while a prior `tick()` promise is still pending) and assert the
    second call resolves immediately to `emptyResult` **without** invoking `doTick` again (the
    overlap-prevention contract).
  - A `doTick` that throws: `tick()` resolves to `emptyResult` (doesn't reject), and a subsequent
    `tick()` call proceeds normally (the `isTicking` flag is always cleared in `finally`, even on
    throw).
  - `armTicking()`/`disarmTicking()`: `armed` reflects the timer state; re-arming with a smaller
    `currentIntervalMs()` picks up the new interval (mirrors each watcher's existing
    `SystemConfigStore.onChange` re-arm test, if any exist today — check each watcher's test file
    for one to carry over the assertion, not just add a new generic one).
- Per-watcher migration: existing test files (`channel-watcher.service.test.ts`,
  `monitor-watcher.service.test.ts`, `scheduler.service.test.ts`, `task-scheduler.service.test.ts`,
  `limit-resume.service.test.ts`) should pass unchanged for their `tick()`-return-value assertions
  (public signature preserved) — run each scoped suite after its migration step, not just once at
  the end.
- New assertions per the two extra fixes:
  - Channel watcher: a message whose `flow.handle()` throws stays `state:"new"`; a **second**
    `tick()` call re-`handle()`s it (the sweep) and, once `handle()` succeeds, it's no longer
    picked up by a third tick. Extend the existing "isolates a failing integration" test
    (`channel-watcher.service.test.ts:125`) or add a sibling test for the intra-item (not
    intra-integration) failure path.
  - Automations: a `tick()` with two due automations where the first's `fire()` throws — assert
    the second still fires (loop doesn't abort) and the thrown error is logged, not swallowed
    silently.
- Commands, in order per project convention: `pnpm check:lint`, `pnpm check:types`, `pnpm test`
  (or scoped: `pnpm exec vitest run apps/api/src/shared/watchers apps/api/src/channels
  apps/api/src/monitors apps/api/src/automations apps/api/src/tasks/task-scheduler.service.test.ts
  apps/api/src/limits-resume`).

## Effort & risk

**M.** Mechanical in shape (one new base class, five call-site migrations deleting near-identical
boilerplate) but touches 5 live, always-armed watchers — a regression here is a silent-production
class of bug (a watcher that stops ticking, or double-ticks worse than today). Mitigate by
migrating in ascending risk order (step 2) with the full scoped test suite green after each one,
not batched into a single commit. Task-scheduler is the standout risk: its `onModuleInit` carries
unrelated wiring (4 runner subscriptions, approvals registration) that must survive the base-class
`super.onModuleInit()` call untouched — migrate it last, once the pattern is proven on the other
four, and diff its `onModuleInit`/`onModuleDestroy` particularly carefully against the current
L169-205/L255-258. The channel-watcher and automations behavioral fixes are each small and
independently testable, so they don't compound the timer-migration risk.
