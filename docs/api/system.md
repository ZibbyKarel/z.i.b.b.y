# System config

The runtime system config replaces a set of knobs that used to be start-only
environment variables (`TASK_TICK_MS`, `GOAL_AUTO_RESUME`, and friends) with a
single file the operator can edit live from `/settings` — in keeping with the
"files are the source of truth" law. This page covers the store and its two
endpoints; the full key-by-key table (what each knob does, its default, and
which scheduler it arms) lives in `docs/ops/environment.md`'s runtime
system-config section — link there rather than duplicating the table here.

## Pieces

| Piece      | File                                           | Role                                                          |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------- |
| Schema     | `libs/contracts/src/system/system.schema.ts`   | `SystemConfigSchema` (`.strict()`) — every knob has a default |
| Contract   | `libs/contracts/src/system/system.contract.ts` | `systemContract` — `GET`/`PUT /api/system/config`             |
| Store      | `apps/api/src/system/system-config.store.ts`   | `SystemConfigStore` — in-memory + file-backed, `@Global`      |
| Controller | `apps/api/src/system/system.controller.ts`     | Implements the contract                                       |

## Flow

1. `SystemConfigStore` loads `data/system-config.json` **synchronously** in
   its constructor (`readFileSync`, not the usual async pattern). A missing or
   garbage file parses as `SystemConfigSchema.parse({})` — every field has a
   default, so `{}` reproduces the historical "env var unset" behavior
   exactly.
2. The store is `@Global` and holds the config in memory, exposed
   synchronously via `current()`. This matters because its consumers are
   synchronous hot paths that can't await a read: `AdapterRegistry.resolve()`
   (per-integration, on every channel tick), `GoalRunnerService`'s shell
   timeout lookup, and the various schedulers' arm logic. `@Global` gives
   every module visibility into the store but not init-order guarantees, so a
   consumer's `onModuleInit` could in principle run before an async load
   resolved — the synchronous constructor load sidesteps that for this one
   small file.
3. `write()` re-validates the whole document against `SystemConfigSchema`
   (`.strict()`, so a stale or renamed key can't silently smuggle in a knob
   the server no longer honors), persists it atomically, updates the
   in-memory copy, and calls every subscriber registered via `onChange()`.
   The schedulers use this to re-arm their interval timers immediately —
   most knobs (tick intervals, `limitResumeMax`, `goalVerifyTimeoutMs`,
   `maxConcurrentRuns`, `chatPersona`) take effect live, with one exception:
   `goalAutoResume` is only read at boot, so it applies on the _next_ start,
   not immediately.
   - `maxConcurrentRuns` (Phase 125c) is the system-wide ceiling on
     concurrently running tasks — `null`, the default, means uncapped and
     preserves the pre-125c behaviour exactly. It is nullable rather than
     optional because `SystemConfigSchema` is `.strict()` and every field
     needs a default; `null` reads as "no override", mirroring `ttsVoice`.
     The scheduler reads it at use time (never caches it in a field), which
     is what makes a save apply to the very next dispatch. Enforcement lives
     in `TaskSchedulerService` — see [tasks.md](./tasks.md).
   - `roadmapTickMs` (Phase 125h) drives the roadmap tick: it re-syncs every
     project whose per-project `_config.json` sets `autoSync: true`, and
     reconciles running / `awaiting-merge` roadmap items. That reconcile is
     the **poll** half of the roadmap's two release signals — it catches a PR
     merged directly on GitHub, where the eager `recordMerge` hook never fires.
     Like the other `*TickMs` knobs it re-arms live via `onChange()`. See
     [roadmap.md](./roadmap.md).
4. `GET /system/config` / `PUT /system/config` are the only two endpoints;
   `putConfig` replaces the entire document (not a partial patch).

## Not the same thing: the locked policy floor

`system.controller.ts` does **not** expose the locked `POLICY.md` autonomy
floor shown on the web `/gates` page — that document and its
`GET /api/gates/policy` endpoint live in `apps/api/src/gates`
(`policy.storage.service.ts`, `gates.controller.ts`) and are covered in
`docs/api/gates.md`. The two are easy to conflate since both are
"operator-owned config files edited from a settings-like screen," but they
are separate stores with separate endpoints: `system-config.json` is editable
runtime tuning, `POLICY.md` is the locked, non-negotiable gate floor.

## Endpoints (`/api/system`)

- `GET /system/config` — the effective config (schema defaults for any key
  the file doesn't set).
- `PUT /system/config` — replace the whole config. `.strict()` validation
  rejects an unknown key outright rather than accepting and ignoring it.
