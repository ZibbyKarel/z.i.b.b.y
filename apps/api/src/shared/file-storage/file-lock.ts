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
 * Run `fn` with exclusive access to `key`, queued behind any in-flight work on the
 * same key. Returns `fn`'s result (or rejects with its error) — the serialization is
 * transparent to the caller. A throwing `fn` does not break the chain: the next
 * waiter still runs.
 */
export function withPathLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  // Chain after the previous holder settles, success OR failure, so one task's
  // error never strands the queue.
  const run = prev.then(fn, fn);
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
