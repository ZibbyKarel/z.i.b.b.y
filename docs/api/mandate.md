# Mandate

> "The tier — not the channel — decides how ZIBBY acts." (root `CLAUDE.md`, "The
> autonomy contract")

The mandate is the one place that turns the autonomy contract's tiers into a
concrete, per-channel on/off switch: whether ZIBBY may **dispatch** a task
unprompted for a given channel, and whether it may **reply** on that channel
without asking first. It does not redefine the tiers themselves — see root
`CLAUDE.md`'s "The autonomy contract" section for what Tier 1/2/3 mean — it
only says which channels get Tier-1/2 treatment at all.

## Pieces

| Piece      | File                                             | Role                                                                          |
| ---------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Schema     | `libs/contracts/src/mandate/mandate.schema.ts`   | `MandateSchema` (strict), `MandateWriteSchema` (permissive transport shape), `DEFAULT_MANDATE` |
| Contract   | `libs/contracts/src/mandate/mandate.contract.ts` | `mandateContract` — `GET`/`PUT /api/mandate`                                  |
| Storage    | `apps/api/src/mandate/mandate.storage.service.ts` | `MandateStorageService` — reads/writes the single `mandate.json` at the data root |
| Controller | `apps/api/src/mandate/mandate.controller.ts`     | Implements the contract; re-validates strictly and returns 422 on unknown keys |

There is exactly **one** mandate document — no id, no list, like `POLICY.md`.

## Flow

1. On boot, `MandateStorageService.onModuleInit` seeds `mandate.json` with
   `DEFAULT_MANDATE` if the file is missing: `defaults: { dispatch: true, reply:
   false }`, `channels: {}`. Dispatch works out of the box (Tier 1 investigation
   is silent and reversible); no outbound reply leaves any channel until the
   operator opts a channel in explicitly.
2. `read()` is tolerant: a missing or malformed file falls back to
   `DEFAULT_MANDATE` rather than throwing, so a corrupted file never blocks a
   channel tick.
3. `write()` is the only path that changes the mandate, and only the
   operator's `PUT /api/mandate` calls it. The transport schema
   (`MandateWriteSchema`) is deliberately `.passthrough()` at every level so an
   unknown key reaches the controller instead of being silently stripped by a
   lenient transport parse; the controller then re-validates against the
   strict `MandateSchema` and returns `422` on any unknown or invalid field.
   This makes "reject unknown keys" an explicit, testable behavior rather than
   an accidental side effect of transport validation — a channel item can
   never widen its own autonomy through a smuggled field (Law 4).
4. `ChannelTriageFlowService` (`apps/api/src/channels/channel-triage-flow.service.ts`)
   is the mandate's one real consumer. For each triaged channel item it reads
   the mandate once and resolves per-channel overrides over the defaults
   (`mandate.channels[integrationId]?.[key] ?? mandate.defaults[key]`) to
   decide:
   - **Tier 1** — actionable and `dispatch` is on: dispatch a delivery task
     silently through the normal scheduler.
   - **Tier 2** — `reply` is on and the channel-reply gate rule resolves below
     `ask`: send the drafted reply.
   - **Tier 3** — otherwise (reply off, a hardened `ask`/`deny` gate rule, or
     low triage confidence): park a kind-`channel` approval carrying the
     draft; the operator approves to send or rejects to ignore.

## Endpoints (`/api/mandate`)

- `GET /mandate` — the current mandate (seeded if this is the first read).
- `PUT /mandate` — replace the mandate. Body is validated strictly; any
  unknown or malformed field returns `422` and the write is rejected outright
  (no partial merge).
