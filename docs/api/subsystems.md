# Subsystems (GAIA-style federation registry)

Phase 80 of the subsystem-federation arc — see
`docs/superpowers/specs/2026-07-08-subsystem-federation-design.md` for the design
doc and `docs/plans/phase-80-subsystem-registry.md` for the implementation plan.
The eight named subsystems (Forge, Puls, Sentinel, Maestro, Beacon, Scout, Herald,
Loom) become a real, typed registry: identity + a stub status. No live status
aggregation yet (phase 82), no UI yet (phase 83+).

**Not to be confused with** `apps/api/src/health/subsystem-health.service.ts` —
an unrelated, pre-existing concept (M8 health-liveness aggregation of
backend/vault/integrations/scheduler). Never touch or reuse it for this resource.

## Pieces

| Piece      | File                                                    | Role                                                                 |
| ---------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Schema     | `libs/contracts/src/subsystems/subsystem.schema.ts`       | `SubsystemIdSchema` (8-value enum), `SubsystemSchema`, `SUBSYSTEMS` registry constant, `SubsystemStateSchema`, `SubsystemWithStatusSchema` |
| Contract   | `libs/contracts/src/subsystems/subsystems.contract.ts`     | `subsystemsContract` — `getSubsystems` (`GET /api/subsystems`), `getSubsystem` (`GET /api/subsystems/:id`, 404 on unknown id) |
| Errors     | `apps/api/src/subsystems/subsystems.errors.ts`             | `SubsystemNotFoundError`                                              |
| Service    | `apps/api/src/subsystems/subsystems.service.ts`             | `SubsystemsService.list()` / `.get(id)` — maps `SUBSYSTEMS` to with-status entries, phase-80 stub status |
| Controller | `apps/api/src/subsystems/subsystems.controller.ts`          | implements `subsystemsContract` via the shared `makeErrorMapper` 404 pattern |
| Module     | `apps/api/src/subsystems/subsystems.module.ts`              | no dependencies yet — registered in `app.module.ts`                   |
| Web query  | `apps/web/features/subsystems/queries/useSubsystemsQuery.ts` | `refetchInterval` ~15s, `select: selectApiResponseBody`, same posture as `useHealthQuery`/`useSelfStatusQuery` |

## The registry

`SUBSYSTEMS` is a checked-in TS constant (not a `.zibby/data` file) — a config
file, per the design doc's own framing, that both API and web import
type-safely with zero fs plumbing, since the eight entries are fixed,
non-user-generated data. Each entry: `{ id, name, tagline, mandate, color,
heroImage }`. `name` is the mythic name ("Forge"), `tagline` a short Czech
epithet, `mandate` the one-line Czech mandate from the design doc's federation
table, `heroImage` a root-relative path or `null` (all `null` until phase 90
ships the art).

**Colors are PROVISIONAL.** Forge is orange `#f97316`, established by its
existing hero art (`design/Z.I.B.B.Y/uploads/Forge.png`). The other seven carry
placeholder hues (puls teal, sentinel red, maestro violet, beacon amber, scout
green, herald blue, loom indigo) — each swappable by editing one registry line.
Visual identity for the seven non-Forge subsystems is a deliberately-deferred
design-doc item; do not treat these as final.

## Status shape (phase-80 stub)

`SubsystemWithStatusSchema` extends the identity schema with
`{ state: "klid" | "bezi" | "hlaseni" | "ceka", tier2Count, tier3Count }`. Phase
80 always serves `{ state: "klid", tier2Count: 0, tier3Count: 0 }` for every
entry — the shape lands now so the web query is stable; phase 82 fills in real
aggregation across running pipelines/goals/approvals.

## Endpoints (`/api/subsystems`)

- `GET /subsystems` — all 8 entries, registry (insertion) order; severity
  ordering is deferred to a later phase.
- `GET /subsystems/:id` — 200 with the matching entry, 404 `{ message }` for an
  unknown id. `:id` is validated as a plain string in the contract (not the
  `SubsystemIdSchema` enum) so an unrecognized id reaches the controller and
  comes back as the contract's declared 404 — an enum-typed `pathParams` would
  fail ts-rest's own request validation first and throw a 400
  `BadRequestException` before the handler's 404 mapping ever ran.
