# Health (M8 — never fail silently)

The **health** module answers "is ZIBBY actually working right now," beyond plain
process liveness. `SubsystemHealthService` (`apps/api/src/health/subsystem-health.service.ts`)
probes every subsystem the operator depends on; `HealthController`
(`apps/api/src/health/health.controller.ts`) folds those probes together with the
Claude CLI preflight into one readiness payload.

## Pieces

| Piece      | File                                                          | Role                                                                                      |
| ---------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Contract   | `libs/contracts/src/health/health.schema.ts`                       | `HealthSchema`, `SubsystemHealthSchema` (`name`/`status`/`detail`), `ClaudeHealthSchema`      |
| Contract   | `libs/contracts/src/health/health.contract.ts`                     | `healthContract` — `getHealth` under `/api/health`, kept separate from the agents resource since it's a cross-cutting operational concern |
| Service    | `apps/api/src/health/subsystem-health.service.ts`                  | `SubsystemHealthService.probeAll()` — probes vault, integrations, scheduler concurrently   |
| Controller | `apps/api/src/health/health.controller.ts`                        | implements `healthContract`; also calls the Claude CLI preflight probe                     |
| Module     | `apps/api/src/health/health.module.ts`                             | imports `ClaudeRunModule`, `MemoryModule`, `IntegrationsModule`, `AutomationsModule` for their exported probe targets |

## Flow

1. `probeAll()` runs three checks concurrently:
   - **vault** — `VaultService.index()` must be readable; `ok` if it resolves,
     `down` with the caught error's message otherwise.
   - **integrations** — `IntegrationsStorageService.list()` must be listable; same
     `ok`/`down` pattern.
   - **scheduler** — reads `SchedulerService.health()`. `ok` if the tick loop is
     armed and running (with a `detail` noting the last tick time if known); also
     `ok` (not degraded) if the loop is intentionally disabled (`tickMs <= 0`, the
     test/CI posture) — only `degraded` when the loop was configured to run but
     failed to arm.
   - **backend** is not probed — it is `ok` by definition, since the process
     answered the request at all.
2. Each probe is defensive by construction: it can only resolve to a
   `SubsystemHealth` row, never throw, so one unreachable subsystem degrades only
   its own line rather than failing the whole health check.
3. `HealthController.getHealth` runs the Claude CLI preflight
   (`ClaudePreflightService.probe()`) and `probeAll()` concurrently, then composes
   the overall `status`: `"degraded"` if the Claude preflight fails **or** any
   subsystem is not `ok`; `"ok"` otherwise. The payload also carries `uptime`
   (`process.uptime()`) and an ISO `timestamp`.

This is the M8 "never fail silently" floor: the dashboard never has to infer a fault
from an absence of data — a broken subsystem shows up as its own named, `down` or
`degraded` row in the same response the liveness check already returns.

## Endpoints (`/api/health`)

- `GET /health` — liveness + readiness in one payload:
  `{ status: "ok" | "degraded", uptime, timestamp, claude, subsystems }`, where
  `claude` is `{ ok, version?, reason? }` from the CLI preflight and `subsystems`
  is the array of `{ name, status, detail? }` rows from `probeAll()` (currently
  `backend`, `vault`, `integrations`, `scheduler`).
