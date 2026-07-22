# Pins (Overview quick-launch panel)

The **pins** module backs the Overview page's quick-launch panel — a small,
operator-owned list of pinned agents or pipelines for one-click access,
persisted as a single file (`data/pins.json`), the same architectural slot as
`SystemConfigStore` (`docs/api/system.md`): one small document, not a collection of
named entities.

## Pieces

| Piece      | File                                       | Role                                                                                        |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Contract   | `libs/contracts/src/pins/pin.schema.ts`    | `PinKindSchema` (`agent` \| `pipeline`), `PinSchema` (`{ kind, id }`), `PinsSchema` (array) |
| Contract   | `libs/contracts/src/pins/pins.contract.ts` | `pinsContract` — `getPins` / `putPins` under `/api/pins`                                    |
| Store      | `apps/api/src/pins/pins.store.ts`          | `PinsStore` — synchronous load at construction, atomic writes, dedupe on write              |
| Controller | `apps/api/src/pins/pins.controller.ts`     | implements `pinsContract`                                                                   |
| Module     | `apps/api/src/pins/pins.module.ts`         | resolves `PINS_FILE` (`$PINS_FILE` env or `data/pins.json`)                                 |

A pin carries only `{ kind, id }` — no display name or icon. Those are read live
from the matching catalog (agents / pipelines) at render time, so renaming
an entity shows up in the panel immediately with no separate sync step.

## Flow

1. `PinsStore` loads `data/pins.json` synchronously in its constructor (same
   reasoning as `SystemConfigStore`: config must be available before the first
   request, and the file is small). A missing or corrupt file yields an empty list
   rather than an error.
2. `read()` returns the in-memory list.
3. `write(next)` validates the incoming list against `PinsSchema`, dedupes by
   `kind:id` (last occurrence wins), writes the deduped list atomically to disk, and
   updates the in-memory copy.
4. The client owns all ordering/add/remove logic: `putPins` always replaces the
   whole list — the client computes the new list (e.g. append one pin, or drop one)
   and PUTs it back in full; there is no incremental add/remove endpoint.

## Endpoints (`/api/pins`)

- `GET /pins` — the current pinned list (`[]` if the file doesn't exist yet).
- `PUT /pins` — replace the whole list; the response is the deduped, persisted list.
