# Phase 123 — Shared `withPathLock` in the storage layer (close the lost-update pattern)

> `docs/audit/report-final.md:32` (cross-cutting systemic problem #3):
> _"Systémový lost-update / TOCTOU vzor napříč vším storage. Kořen: `EntityFileStore.writeEntity`
> a `category-manifest-store` dělají read-modify-write bez `withPathLock` (atomic rename brání jen
> torn file, ne ztracenému zápisu). Projevuje se v scheduler outcome (double-PR), budget ledger (cap
> bypass), vault notes, automations markFired, pipeline/goal resume, monitor/channel dedup,
> run-recorder, mcp/hooks/commands create. `withPathLock` existuje, ale je nereentrantní a
> nepoužitý — fix patří do shared vrstvy, ne 10× lokálně."_
>
> `docs/audit/report-final.md:82-83` (Critical, task-scheduler + budget):
> _"`writeAgentOutcome` čte guard, pak `await handleTerminal` (otevře PR) bez zámku → dva terminal
> handlery můžou oba otevřít PR"_ / _"`check()` a `recordDispatch()` bez zámku na immediate-create
> cestě → souběžné vytvoření překročí run cap (proti zákonu no-auto-spend)"_
>
> `docs/audit/report-final.md:114` (cross-cutting recommendation #1):
> _"Zabudovat `withPathLock` do `EntityFileStore`/manifest storů — jediný fix zavře lost-update
> napříč scheduler/budget/vault/automations/pipeline/goal/mcp storage. Nejdřív ale opravit
> nereentranci `withPathLock` (dokumentovat + guard)."_

## Recon (verified)

### The primitive — `withPathLock` (confirmed, incl. the reentrancy bug)

`apps/api/src/shared/file-storage/file-lock.ts` (37 lines, Phase 8.2). A per-key FIFO promise
chain, one process-local `Map<string, Promise<unknown>>` (`tails`, l.12):

```ts
export function withPathLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(() => {}, () => {});
  tails.set(key, tail);
  void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
  return run;
}
```

Correct FIFO serialization for two independent callers on the same key (`file-lock.test.ts` proves
this: sequential, not interleaved, and "two updates to one key both land in order"). **Explicitly
NOT a cross-process lock** — single-instance-per-data-root is a documented precondition (l.6-10),
unchanged by this phase.

**Why it deadlocks on reentry (confirmed by tracing the synchronous portion):** `tails.set(key,
tail)` runs **synchronously**, before `fn` (`prev.then(fn, fn)`) ever executes — `.then` callbacks
are deferred to the microtask queue. So by the time `fn`'s body starts running, `tails.get(key)` is
already the *outer* call's `tail`. If `fn` — while still executing, i.e. before `run` has
settled — calls `withPathLock(key, innerFn)` again, the inner call's `prev` resolves to the outer's
`tail`, which is chained after `run`, which will not settle until `fn` (the outer call, currently
paused awaiting the inner call) returns. Circular wait, permanent hang: outer awaits inner; inner's
queue position awaits outer. No test in `file-lock.test.ts` exercises this — the reentrancy bug is
real and untested, exactly as the audit states.

### The two write paths with no lock at all

**`EntityFileStore`** (`apps/api/src/shared/file-storage/entity-file-store.ts`) — abstract base for
every JSON/Markdown entity store. `writeEntity` (l.102-106) is a single atomic write
(`writeFileAtomic`, temp+rename — crash-safe, not RMW-safe). The base itself has **no** `get()` →
mutate → `writeEntity()` helper; every subclass's `create`/`update`/`patch` hand-rolls that sequence
directly against `writeEntity`, so there is nowhere in the base to have plugged a lock even if one
existed. 12 direct subclasses (`approvals`, `artifacts`, `automations`, `chains`, `discovery`
proposals, `hooks`, `integrations`, `machine-action`, `mcp`, `monitors` (`monitor-event.store.ts`),
`tasks` (`scheduled-tasks.storage.service.ts`)) plus `MarkdownEntityStore`
(`shared/file-storage/markdown-entity-store.ts`, itself an `EntityFileStore` subclass) which is in
turn extended by `goals`, `agents`, `pipelines`, `commands`, `skills` — **17 stores total** inherit
the unlocked `writeEntity`.

**`CategoryManifestStore`** (`apps/api/src/shared/categories/category-manifest-store.ts`) —
`create` (l.60-68) and `delete` (l.71-77) both do `list()` → filter/append → `writeAtomic()` with no
serialization at all; two concurrent `create` calls both read the same old manifest and the second
`writeAtomic` clobbers the first (lost update), and the "name already taken" conflict check
(l.62-64) is itself TOCTOU. 3 subclasses (`projects`, `agents`, `skills` category stores).

### The two Critical races, as concrete interleavings

**1. Scheduler outcome double-PR — `task-scheduler.service.ts:1124` `writeAgentOutcome`:**

```ts
private async writeAgentOutcome(taskId: string, run: AgentRun): Promise<void> {
  ...
  const existing = await this.storage.get(taskId);              // READ
  if (existing.outcome || existing.status === "awaiting-output") return;  // GUARD
  ...
  const delivery = await this.taskOutput.handleTerminal(existing, run, summary); // SIDE EFFECT: opens a PR
  ...
  const task = await this.storage.writeOutcome(taskId, { ... }); // WRITE
```

Two entry points race for the same `taskId`: the fast path
(`agentRunner.onRunStatus` → `writeAgentOutcome` directly, l.174-175) and the sweep path
(`sweepOutcomes` on a tick, l.229 → `reconcileOutcome`, l.1109 → `writeAgentOutcome`, for every
`dispatched` task with no outcome yet). Interleaving:

```
Thread A (onRunStatus fast path)         Thread B (sweepOutcomes tick, same taskId)
  read existing.outcome → undefined
                                            read existing.outcome → undefined   (still true — A hasn't written yet)
  await handleTerminal() → opens PR #1
                                            await handleTerminal() → opens PR #2   (guard already passed)
  writeOutcome(...)
                                            writeOutcome(...)                    (clobbers A's outcome)
```

`sweepOutcomes` runs on a scheduler tick that is entirely independent of the `onRunStatus` event, so
the window is real, not theoretical — a run finishing right as a sweep tick fires hits it.

**2. Budget check→record cap bypass — `budget.service.ts:85` `check()` + `task-scheduler.service.ts`
`attemptCreate`/`attemptDispatch`:**

`check()` (budget.service.ts:85-221) is a pure read (ledger counts + limits snapshot). The caller
holds no lock around it. In `attemptCreate` (immediate-create path, `createTask` → l.534-599):

```ts
const check = await this.budget.check(projectId, new Date(now));   // READ (l.563)
if (!check.ok) { ...hold...; return; }
if (await this.atCapacity(project)) { ...queue...; return; }       // ANOTHER read, same gap (l.570)
...
const dispatched = await this.dispatch(...);                        // classify + spawn — seconds, not micro-ticks
const task = await this.persistDispatched(...);                     // → recordLedger → budget.recordDispatch (WRITE, l.1026)
```

The identical shape repeats in `attemptDispatch` (l.683-746, used by both `tick()` at l.457 and
`drainQueues` at l.850) — `check` at l.700, `atCapacity` at l.707, `recordLedger` at l.731. Only
`drainQueues` wraps its *own* loop in a lock (`withPathLock("scheduler:drain", …)`, l.831) — that
serializes drain-vs-drain, but **`attemptCreate` (interactive create) and `tick()` (scheduled fire)
are two more entry points that never take that lock**, so a drain in progress does not block them,
and they don't block each other either:

```
Thread A (createTask → attemptCreate, projectId=P)     Thread B (createTask → attemptCreate, projectId=P)
  check(P) → ok (0/1 daily runs used)
                                                           check(P) → ok (0/1 daily runs used — A hasn't recorded yet)
  dispatch() ... (seconds: classify + spawn)
                                                           dispatch() ...
  recordDispatch (ledger: 1/1)
                                                           recordDispatch (ledger: 2/1 — CAP EXCEEDED)
```

`atCapacity` (l.570/707, High-severity paired finding) sits inside the *same* unlocked span, so
closing the budget race with a lock around the whole span closes the concurrency-cap race too, for
free.

### The ~15 read-modify-write sites (confirmed by direct read unless noted)

| # | Site | Sev | Pattern | Fix layer |
|---|---|---|---|---|
| 1 | `shared/categories/category-manifest-store.ts:60-77` `create`/`delete` | High | list→mutate→writeAtomic, no lock | **Shared** — wrap in the store itself |
| 2 | `tasks/task-scheduler.service.ts:1124` `writeAgentOutcome` | **Critical** | guard→PR side effect→write, spans a non-storage side effect | **Call-site** — spans `taskOutput.handleTerminal`, which no storage-layer fix reaches |
| 3 | `budget/budget.service.ts:85` + `task-scheduler.service.ts:563,700` | **Critical** | check→dispatch (seconds)→record, three unlocked entry points (`attemptCreate`, `tick`, `drainQueues`) | **Call-site** — spans `dispatch()` (classify+spawn), not a storage call |
| 4 | `tasks/task-scheduler.service.ts:570,707` `atCapacity` | High | same span as #3 | Closed by #3's lock (no separate work) |
| 5 | `tasks/scheduled-tasks.storage.service.ts` — 14 mutators (`writeOutcome:336`, `setTitle:165`, `setApproval:251`, `markDispatched:345`, `reassignRun:360`, `markHeld:235`, `markQueued:243`, `resolveOutput:324`, `markFailed:370`, `markRetry:388`, `markDeadLettered:402`, `markAwaitingOutput:310`, `markDeferredLimit:221`, `setProjectId:263`) | High | each is `get()`→mutate→`writeEntity()` | **Shared** — once `EntityFileStore` gets a locked RMW helper, refactor these 14 to use it |
| 6 | `automations/automations.storage.service.ts:144,172` `update`/`markFired` | High | same shape | **Shared** |
| 7 | `monitors/monitor-event.store.ts:85` `patch` (+ `putNew` dedup, l.76) | High | read-merge-write / fileExists-then-write | **Shared** (both helpers) |
| 8 | `mcp/mcp.storage.service.ts:74` `create` | Medium | fileExists→writeEntity dedup TOCTOU | **Shared** — via a locked create-with-conflict helper |
| 9 | `hooks/hooks.storage.service.ts:31` `create` | Medium | same shape | **Shared** |
| 10 | `commands/commands.storage.service.ts:36` `create` | Medium | same shape | **Shared** |
| 11 | `approvals/approvals.service.ts:140` `decide` | High | `storage.get`→status check→`storage.update`, at the **service** layer, not inside the store | **Call-site** — de-scoped to a companion phase (approvals serialization); this phase only needs to ship the primitive it depends on |
| 12 | `pipelines/pipeline-runner.service.ts:427,520,1338` `resumeParked`/`resumeLimitPaused`/`resumeOutput` | High | in-memory `Map` + disk aggregate read→status guard→mutate→`drive()`, spans an in-process object, not just a file | **Call-site** — per-run lock |
| 13 | `goals/goal-runner.service.ts:908` `resumeParked` | High | identical shape to #12 (confirmed by direct read) | **Call-site** |
| 14 | `memory/vault.service.ts:333,401,417` `createNote`/`updateNote`/`appendToNote` | Medium | scan→read→mutate→`writeFileAtomic`, no lock — **`updateIndex` in the same file (l.438) already does this correctly** (`withPathLock(\`moc:${mocId}\`, …)`) | **Call-site** — extend the existing sibling pattern |
| 15 | `memory/run-recorder.service.ts:82` `claim` | Medium | `fileExists`→`writeFileAtomic` marker dedup TOCTOU | **Call-site** — not an `EntityFileStore`, bespoke marker file |
| 16 | `channels/channel-item.store.ts:61,75` `put`/`update` dedup (raised via `channel-watcher.service.ts:80` re-entrancy finding, `docs/audit/batches/api-channels-core.md:7-8`) | High | `fileExists`→`writeFileAtomic` dedup TOCTOU | **Call-site** — not an `EntityFileStore` |

Confirmed by direct source read: all rows. Assumed/deferred: row 11 (approvals) is confirmed as a
real race but its fix is out of this phase's scope per the task brief — flagged, not implemented,
so the shared primitive lands compatible with what that companion phase will need.

## Goal

Every read-modify-write against file-backed storage is serialized per logical key, across the whole
process — not just within one store's own methods. `withPathLock` is safe to call from inside a
function that is itself running under a `withPathLock` on the same or a different key (no silent
deadlock). The two Critical races (scheduler double-PR, budget cap bypass) are closed. The ~15 High/
Medium sites in the table above are either closed by the shared-layer fix or explicitly flagged for
a call-site lock with a concrete key.

## Approach

### 1. Fix `withPathLock` reentrancy — recommended: `AsyncLocalStorage`-tracked reentrant keys

Two options, per the audit's framing:

- **(A) Track the current lock owner via async context, allow re-entry.** A module-level
  `AsyncLocalStorage<ReadonlySet<string>>` holds the set of keys the *current async call chain*
  already holds. `withPathLock(key, fn)`: if the ALS store exists and already contains `key`, run
  `fn()` directly (no new queue entry — the caller already has exclusive access transitively).
  Otherwise, queue as today, but execute `fn` inside `als.run(new Set([...current, key]), fn)` so
  anything `fn` `await`s — including a `withPathLock` call several frames deeper — inherits the
  held-key set.
- **(B) Document + assert non-nesting.** Keep `withPathLock` as-is, add a doc comment forbidding
  nested calls on the same key, and rely on code review + call-site discipline (namespace every
  lock key so layers never collide by construction).

**Recommend (A).** This phase deliberately introduces layering — a call-site lock around a
multi-store critical section (`task:${taskId}`, `budget:${projectId}`) that will, once the shared
storage layer also takes its own lock for the nested `writeEntity`/`get` calls inside that critical
section, genuinely nest two `withPathLock` calls in one async chain. (B) works only if every key at
every layer is guaranteed distinct forever — true today by the key-naming convention below, but a
single future call site that reuses a key by convention drift (e.g. someone keys a call-site lock
identically to the storage layer's own key, which is an easy mistake since both are plausibly
`\`${entity}:${id}\``) turns into a silent, permanent hang in production — the worst failure mode
for a scheduler/budget path that Law 3 (no auto-spend) depends on. (A) is a built-in Node primitive
(no new dependency), keeps `withPathLock`'s signature and every existing call site unchanged, and
converts an unbounded footgun into a documented, tested guarantee. Trade-off to note in code review:
(A) also silently permits a caller to re-enter a key from what is *logically* two distinct critical
sections that happen to share a key — acceptable here since every call site in this phase's table
uses a distinct, narrowly-scoped key (see §4), and the test suite (below) pins the intended
semantics so a future misuse is caught by a failing test, not a silent behavior change.

Implementation sketch (`file-lock.ts`):

```ts
const held = new AsyncLocalStorage<ReadonlySet<string>>();

export function withPathLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const current = held.getStore();
  if (current?.has(key)) return fn(); // reentrant — already exclusive on this key
  const next = new Set(current ?? []);
  next.add(key);
  const wrapped = () => held.run(next, fn);
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(wrapped, wrapped);
  // ...tail bookkeeping unchanged
  return run;
}
```

### 2. Thread locking through `EntityFileStore` + `CategoryManifestStore` as the default

- Add a protected helper on `EntityFileStore<T>`: `protected async withEntityLock<R>(id: string, fn:
  () => Promise<R>): Promise<R>` that calls `withPathLock(\`entity:${this.dir}:${id}\`, fn)` —
  namespaced by the store's own data directory (unique per store instance) so two different stores
  never collide on the same id string.
- Add a default `protected async readModifyWrite(id: string, mutate: (current: T) => T): Promise<T>`
  built from `withEntityLock` + the existing `get`/`writeEntity` — the shape every subclass's
  `update`/`patch`/`markX` mutator already hand-rolls. Subclasses (row 5, 6, 7 in the table) refactor
  their mutators to call this instead of `get()` + `writeEntity()` directly.
- Add a default `protected async createUnique(entity: T, conflictError: (id: string) => Error):
  Promise<T>` wrapping the `fileExists` → `writeEntity` dedup shape (rows 7-putNew, 8, 9, 10) in the
  same `withEntityLock`, so the existence check and the write are atomic with respect to each other.
- `CategoryManifestStore.create`/`delete` (row 1): wrap the whole `list()` → mutate → `writeAtomic()`
  body of each in `withPathLock(\`category-manifest:${this.file}\`, …)` — one key per manifest file
  (not per category name), since both methods mutate the whole array.

### 3. Explicit call-site locks for the sites that span more than one store or an in-memory object

- **`writeAgentOutcome`** (row 2): wrap the entire guard→`handleTerminal`→`writeOutcome` body in
  `withPathLock(\`task-outcome:${taskId}\`, …)`. This key is distinct from the storage-layer
  `entity:${scheduledTasksDir}:${taskId}` key that `storage.writeOutcome` will itself acquire once
  step 2 lands (different namespace prefix) — no accidental reentrancy, and with step 1's fix it
  would be safe even if it collided.
- **Budget check→dispatch→record** (row 3, 4): wrap the check→`atCapacity`→`dispatch`→`recordLedger`
  span in both `attemptCreate` (l.534-599) and `attemptDispatch` (l.683-746) in
  `withPathLock(\`budget:${projectId ?? "global"}\`, …)`. `drainQueues`'s existing
  `"scheduler:drain"` lock still wraps its own loop — the new per-project lock nests inside it for
  drain-triggered dispatches (safe under step 1) and is the *only* lock for the `attemptCreate` and
  `tick()` entry points, which is what closes the gap between them.
- **Pipeline/goal resume** (row 12, 13): wrap `resumeParked`/`resumeLimitPaused`/`resumeOutput` (and
  the goal-runner counterpart) in `withPathLock(\`pipeline-run:${pipelineRunId}\`, …)` /
  `withPathLock(\`goal-run:${goalRunId}\`, …)` around the full read→guard→mutate→`writeAggregate`
  span (drive() itself can stay outside the lock — only the state transition needs exclusivity).
- **Vault notes** (row 14): mirror `updateIndex`'s existing `withPathLock(\`moc:${mocId}\`, …)` —
  wrap `createNote`/`updateNote`/`appendToNote` in `withPathLock(\`note:${id}\`, …)` (a fresh id for
  `createNote`'s dedup check needs its own key scheme — e.g. `withPathLock(\`note-create:${slug}\`,
  …)` since the id doesn't exist yet at lock-acquisition time).
- **Run-recorder marker** (row 15): `withPathLock(\`run-marker:${cwd}\`, …)` around `claim`'s
  `fileExists`→`writeFileAtomic`.
- **Channel item dedup** (row 16): `withPathLock(\`channel-item:${integrationId}:${itemId}\`, …)`
  around `put`'s `fileExists`→`writeFileAtomic`. Pairs with (but does not replace) the separate
  `channel-watcher.service.ts:80` re-entrancy-guard fix tracked elsewhere in the audit's P1 list.
- **Approvals `decide`** (row 11): NOT implemented in this phase — flagged only, per the task
  brief. The key convention it should use when a companion phase picks it up:
  `withPathLock(\`approval:${id}\`, …)`.

### 4. Sweep

Grep for `writeEntity(` and `writeAtomic(`/`writeFileAtomic(` outside `file-utils.ts` after steps
2-3 land; anything still doing a bare read-then-write without going through `withEntityLock`/
`readModifyWrite`/an explicit call-site lock is a miss to fix in the same PR or file as a follow-up
with its own line reference (don't let the sweep silently drop a site).

## Testing

- `apps/api/src/shared/file-storage/file-lock.test.ts` (extend): reentrant `withPathLock` on the
  same key (nested call from inside `fn`) resolves instead of hanging — use `vi.useFakeTimers()` or
  a bounded `Promise.race` against a timeout so a regression fails fast instead of hanging CI, e.g.
  `await Promise.race([withPathLock("k", () => withPathLock("k", async () => "inner")), timeout(200)])`
  resolves `"inner"`, not the timeout.
- `apps/api/src/tasks/task-scheduler.service.test.ts` (extend): two concurrent terminal-handler
  invocations for the same task (simulate `onRunStatus` firing while `sweepOutcomes` is also mid-way
  through the same task) result in exactly one `handleTerminal` call / one PR, not two.
- `apps/api/src/budget/budget.service.test.ts` + scheduler test: two concurrent `attemptCreate` (or
  one `attemptCreate` racing `tick()`) for the same project, with a `dailyRuns: 1` cap, result in
  exactly one dispatch recorded — the second is held, not both dispatched.
- `apps/api/src/shared/categories/category-manifest-store.test.ts` (new/extend): two concurrent
  `create` calls with different names both land in the final manifest (no lost update); two
  concurrent `create` calls with the *same* name — one succeeds, one throws `CategoryConflictError`.
- `apps/api/src/pipelines/pipeline-runner.service.test.ts` / `goal-runner.service.test.ts`: two
  concurrent `resumeParked` calls on the same run id result in exactly one `drive()` loop starting
  (assert via a spy or a call counter, not timing).
- Run in order per project convention: `pnpm check:lint`, `pnpm check:types`, `pnpm test` (or scoped:
  `pnpm exec vitest run apps/api/src/shared/file-storage apps/api/src/tasks apps/api/src/budget
  apps/api/src/shared/categories apps/api/src/pipelines apps/api/src/goals apps/api/src/memory
  apps/api/src/channels apps/api/src/monitors apps/api/src/mcp apps/api/src/hooks
  apps/api/src/commands apps/api/src/automations`).

## Effort & risk

**M.** Foundational — touches the most shared file in the storage layer (`entity-file-store.ts`) and
~17 subclasses, plus 6-7 call sites with bespoke locks. Stage it rather than one giant diff:

1. Step 1 (reentrancy fix) alone, fully tested, landed and reviewed first — everything else depends
   on it being correct, and it's independently testable in isolation (no other file touched).
2. Step 2 (`EntityFileStore`/`CategoryManifestStore` helpers) + refactor the mutators in rows 1,
   5-10 to use them. Mechanical per-store, but 17 stores is real surface area — do it in one pass
   with a single shared helper rather than piecemeal, so there's one correctness argument instead of
   17.
3. Step 3 (explicit call-site locks) one site at a time, each independently testable — start with
   the two Criticals (rows 2, 3) since they're the audit's stated priority, then rows 12-16.
4. Row 11 (approvals) explicitly deferred — **a companion phase (approvals decide/reject
   serialization) depends on this phase's step 1 landing first** (its own per-approval lock would hit
   the same reentrancy risk once nested against the storage layer's per-id lock from step 2). Sequence
   that phase after this one, not in parallel.

Risk: a wrong lock-key scope either (a) over-serializes unrelated work (safe but slower — a key
namespaced too coarsely, e.g. locking all of `budget:` instead of `budget:${projectId}`, would
serialize every project's dispatches through one global lock) or (b) under-serializes (namespaced
too finely, missing the actual race). Both are review-catchable from the key expressions in the diff
— call out each new lock key's scope explicitly in the PR description.
