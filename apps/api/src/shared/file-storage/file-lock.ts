import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-key in-process serialization (Phase 8.2). The API is a single Node process,
 * so a read-modify-write on a shared file (a vault MOC line) only races *other
 * async tasks in this same process* — two runs finishing on the same project. A
 * promise chain per key is the whole fix: calls with the same `key` run strictly one
 * after another (FIFO), while calls with different keys stay fully concurrent.
 *
 * This is NOT a cross-process file lock — it does nothing for two API processes
 * sharing a data root. That configuration is explicitly out of scope (docs/ops.md:
 * "one instance per data root"; the launchd KeepAlive label guarantees it).
 */
const tails = new Map<string, Promise<unknown>>();

/**
 * The set of keys currently held by the executing async chain (Task 3). Tracked via
 * `AsyncLocalStorage` so `withPathLock` can tell "is this key already held by an
 * ancestor call, anywhere up this async chain" across `await` boundaries — the only
 * reliable way to do that without threading an explicit parameter through every
 * locked call site.
 */
const heldKeys = new AsyncLocalStorage<ReadonlySet<string>>();

/**
 * Run `fn` with exclusive access to `key`, queued behind any in-flight work on the
 * same key. Returns `fn`'s result (or rejects with its error) — the serialization is
 * transparent to the caller. A throwing `fn` does not break the chain: the next
 * waiter still runs.
 *
 * REENTRANT: if the calling async chain already holds `key` (an ancestor call is
 * itself inside `withPathLock(key, ...)`), `fn` runs immediately, inline — no
 * re-queue, since exclusivity on `key` is already established. This is required so a
 * caller-level lock around a wider critical section (e.g. a guard read → an external
 * side effect → a store write) can safely call into a store method that locks the
 * same key underneath, without deadlocking against itself. Locks on DIFFERENT keys
 * are unaffected and stay fully concurrent with each other, including while nested.
 *
 * CONTRACT — do NOT spawn detached work that re-enters the same key from inside a held
 * section. Because the held-set rides `AsyncLocalStorage`, any fire-and-forget promise,
 * `setTimeout`/`setImmediate`, or `queueMicrotask` scheduled INSIDE `fn` captures the
 * ambient held-set; if it later calls `withPathLock(sameKey, …)` AFTER the holder has
 * released, it still sees `key` as held and runs inline, unprotected — silently breaking
 * mutual exclusion. Always `await` work that must be serialized before `fn` returns, and
 * never re-enter the same key from an unawaited continuation. (Reentrancy is only safe
 * for synchronous descendants and awaited calls, which is every current caller.)
 */
export function withPathLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const held = heldKeys.getStore();
  if (held?.has(key)) return fn();

  const nextHeld = held ? new Set(held).add(key) : new Set([key]);
  const prev = tails.get(key) ?? Promise.resolve();
  // Chain after the previous holder settles, success OR failure, so one task's
  // error never strands the queue. Run `fn` inside the widened held-set so any
  // nested call to the same key (from `fn` itself, or anything it awaits) sees
  // `key` as already held.
  const run = prev.then(
    () => heldKeys.run(nextHeld, fn),
    () => heldKeys.run(nextHeld, fn),
  );
  // The stored tail swallows errors (so the NEXT caller chaining off it isn't
  // rejected) and self-cleans the map entry once it is the latest settled tail.
  const tail = run.then(
    () => {},
    () => {},
  );
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
