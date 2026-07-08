# Phase 80 — Subsystem federation: registry + contracts resource

> First slice of `docs/superpowers/specs/2026-07-08-subsystem-federation-design.md`: the eight
> named subsystems (Forge, Puls, Sentinel, Maestro, Beacon, Scout, Herald, Loom) become a real,
> typed registry — identity only. No live status yet (phase 82), no UI yet (phase 83+).

## Design decisions (architect, recorded here)

- **Registry = typed constants in `libs/contracts`**, not a `.zibby/data` file. The design doc
  wants "a config file, not a table" — a checked-in TS module IS a file (source of truth,
  auditable, versioned), and both web and api import it type-safely with zero fs plumbing for
  what is fixed, non-user-generated data (exactly eight entries).
- **Colors are PROVISIONAL.** Visual identity for the seven non-Forge subsystems is a
  deliberately-deferred item in the design doc. Forge is orange `#f97316` (established by its
  existing hero art `design/Z.I.B.B.Y/uploads/Forge.png`). The other seven get placeholder hues,
  each swappable by editing one registry line. Do not present these as final.
- **Naming collision**: `apps/api/src/health/subsystem-health.service.ts` already uses
  "subsystem" for health-liveness aggregation — unrelated concept. The new module is
  `apps/api/src/subsystems/` with `SubsystemsService`; never touch or reuse the health one.

## 1 — Contract — `subsystems` resource

`libs/contracts/src/subsystems/` (follow the `health` resource pattern):

- `subsystem.schema.ts`:
  - `SubsystemIdSchema = z.enum(["forge","puls","sentinel","maestro","beacon","scout","herald","loom"])`
    + `SubsystemId` type.
  - `SubsystemSchema = z.object({ id: SubsystemIdSchema, name: z.string().min(1), tagline: z.string().min(1), mandate: z.string().min(1), color: z.string().regex(/^#[0-9a-f]{6}$/i), heroImage: z.string().nullable() })`.
    `name` is the mythic name ("Forge"); `tagline` a short Czech epithet; `mandate` the one-line
    Czech mandate from the design doc's federation table; `heroImage` a root-relative path or
    null (all null until phase 90).
  - `SUBSYSTEMS: readonly Subsystem[]` — the eight entries, mandates translated from the design
    doc table (Forge = delivery orchestration, Puls = sensing, Sentinel = external security
    landscape, Maestro = releases, Beacon = incident escalation, Scout = research, Herald =
    external voice, Loom = proactive code quality/architecture analysis).
  - `SubsystemStateSchema = z.enum(["klid","bezi","hlaseni","ceka"])` and
    `SubsystemWithStatusSchema = SubsystemSchema.extend({ state: SubsystemStateSchema, tier2Count: z.number().int().nonnegative(), tier3Count: z.number().int().nonnegative() })`
    — phase 80 always serves `{ state: "klid", tier2Count: 0, tier3Count: 0 }`; real aggregation
    is phase 82's job, the shape lands now so the web query is stable.
- `subsystems.contract.ts`:
  - `getSubsystems: GET /subsystems → 200: z.array(SubsystemWithStatusSchema)` (severity-ordered
    later; insertion order for now).
  - `getSubsystem: GET /subsystems/:id → 200: SubsystemWithStatusSchema, 404: ErrorSchema`.
- Barrel + register `subsystems` in `app.contract.ts`. Contract round-trip + route tests
  (registry has exactly 8 entries, unique ids, valid colors; unknown id → 404 shape).

## 2 — API — `SubsystemsModule`

`apps/api/src/subsystems/`: `subsystems.module.ts`, `subsystems.controller.ts`,
`subsystems.service.ts`. Service v80 is thin: map `SUBSYSTEMS` to with-status entries (stub
state as above); `getSubsystem` throws NotFound for unknown ids (contract 404). Register in
`app.module.ts`. Tests: list returns 8 in registry order with stub status; unknown id → 404.

## 3 — Web — query hooks only

`apps/web/features/subsystems/queries/useSubsystemsQuery.ts` (+ `getSubsystemsQueryKey`,
`select: selectApiResponseBody`, `queries/index.ts` barrel). Polled STATE (like `health`), a
modest `refetchInterval` (~15s) — phase 89 adds SSE-driven immediacy; state polling stays per
the SSE-for-streams/poll-for-state DNA. No components yet.

## Verification (paste real output; plain npx — no rtk for tsc)

- `npx tsc -p libs/contracts/tsconfig.json --noEmit`, api, web tsconfigs — clean.
- `npx eslint <touched>` — clean.
- `npx vitest run libs/contracts apps/api/src/subsystems apps/web/features/subsystems` — green.

## Constraints

- Contract-first; `health` is the reference resource. No `any`, React 19 conventions.
- Czech-primary strings live in the registry itself (it is data, like other data modules per
  the i18n convention "data modules hold keys"); en catalog sync is not needed for registry
  fields in this phase (no rendering yet).
- Do NOT touch `apps/api/src/health/subsystem-health.service.ts`.
