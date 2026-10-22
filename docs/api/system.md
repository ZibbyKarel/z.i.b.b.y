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
   - `maxConcurrentRuns` is the global run-slot cap: the most task runs (a single-agent
     run, an orchestrator run, a whole workflow run, a goal run) in flight at once. It
     defaults to **`3`** and is always set (never `null`). A project can add its own lower
     cap via `budget.maxConcurrent`. It reads live, so a save (or a raised cap) admits
     queued tasks immediately. The interim key `maxWorkingAgents` migrates to it on read
     (the file is rewritten in the new shape on the next save). See
     [tasks.md](./tasks.md) → _Run slots_.
   - `dockDoneTasksLimit` (1–100, default `20`) is UI-only: how many of the
     newest archived runs the web shell's activity dock lists under "Hotové"
     (read via `GET /tasks/runs/archive?limit=N`). The API stores it, nothing
     server-side reads it; a stored file without the key reads back as `20`.
   - `roadmapTickMs` (Phase 125h) is `RoadmapTickService`'s heartbeat —
     `900_000` (15 min) by default, `0` disables, re-arms live via `onChange()` like the
     other `*TickMs` knobs. Each tick re-syncs every project whose roadmap
     config has `autoSync: true`, then drives
     `RoadmapGateService.reconcileRunning`/`reconcileAwaitingMerge` for every
     project with a roadmap (independent of `autoSync` — this is the **poll**
     half of the roadmap's two release signals, the one that catches a PR
     merged directly on GitHub, where the eager `recordMerge` hook never
     fires), then runs auto-pickup for every project with `autoPlay: true`.
     See [roadmap.md](./roadmap.md).
4. `GET /system/config` / `PUT /system/config` are the only two endpoints;
   `putConfig` replaces the entire document (not a partial patch).
5. **`operatorName`/`companyName`** (ZB-01, O-21) are additive `.optional()`
   fields, deliberately with no schema default — the header's fallback
   (`operatorName ?? "CEO"`, `companyName ?? "ZibbyCorp"`) lives in the web app,
   not the schema. Nothing seeds `operatorName` automatically; the operator
   sets it from `/system/settings/general` (ZB-11 builds that screen — until
   then, `PUT /system/config` is the only way to set it).
6. **`ui`** holds operator UI preferences that must follow the operator across
   browsers: `density` (system-wide DS spacing, default `airy`) and `bridge`
   (the `/dashboard` Bridge board's layout, active preset, saved presets,
   `arranged` — which layouts sit in the header vs. its dropdown, `removed` —
   deleted built-in layouts (REVIEW), collapsed widgets, closed epics). Every writer must pass `ui` through —
   the PUT replaces the whole document. See
   [bridge-dashboard-design.md](../plans/bridge-dashboard-design.md).

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
