# Pins (Overview quick-launch panel + sidebar Pinned)

The **pins** module backs two surfaces off one list: the Overview page's
quick-launch panel (entity pins) and the left sidebar's "Pinned" section (page
pins). Both are a small, operator-owned list persisted as a single file
(`data/pins.json`), the same architectural slot as `SystemConfigStore`
(`docs/api/system.md`): one small document, not a collection of named entities.

## Pieces

| Piece      | File                                       | Role                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract   | `libs/contracts/src/pins/pin.schema.ts`    | `EntityPinKindSchema` (`agent` \| `workflow` \| `employee`), `PinKindSchema` (adds `page`), `EntityPinSchema` (`{ kind, id }`), `PagePinSchema` (`{ kind: "page", id, label }`), `PinSchema` (discriminated union), `PinsSchema` (array) |
| Contract   | `libs/contracts/src/pins/pins.contract.ts` | `pinsContract` — `getPins` / `putPins` under `/api/pins`                                                                                                                                                                                 |
| Store      | `apps/api/src/pins/pins.store.ts`          | `PinsStore` — synchronous load at construction, atomic writes, dedupe on write                                                                                                                                                           |
| Controller | `apps/api/src/pins/pins.controller.ts`     | implements `pinsContract`                                                                                                                                                                                                                |
| Module     | `apps/api/src/pins/pins.module.ts`         | resolves `PINS_FILE` (`$PINS_FILE` env or `data/pins.json`)                                                                                                                                                                              |

An **entity pin** carries only `{ kind, id }` — no display name or icon. Those
are read live from the matching catalog (agents / workflows / employees) at
render time, so renaming an entity shows up in the panel immediately with no
separate sync step.

A **page pin** (`kind: "page"`) carries `{ id, label }`: `id` is the page's href
(pathname + search, minus the transient `?approval=` param) — that href IS the
pin's identity, there's no catalog entry to dedupe against — and `label` is the
operator-given name typed into the pin dialog at pin time (a page has no live
source of truth for a name, unlike an entity).

## Flow

1. `PinsStore` loads `data/pins.json` synchronously in its constructor (same
   reasoning as `SystemConfigStore`: config must be available before the first
   request, and the file is small). A missing or corrupt file yields an empty list
   rather than an error.
2. `read()` returns the in-memory list.
3. `write(next)` validates the incoming list against `PinsSchema`, dedupes by
   `kind:id` (last occurrence wins — for a page pin, `id` is the href, so this
   is "re-pinning the same href replaces its label"), writes the deduped list
   atomically to disk, and updates the in-memory copy.
4. The client owns all ordering/add/remove logic: `putPins` always replaces the
   whole list — the client computes the new list (e.g. append one pin, or drop one)
   and PUTs it back in full; there is no incremental add/remove endpoint.

## Endpoints (`/api/pins`)

- `GET /pins` — the current pinned list (`[]` if the file doesn't exist yet).
- `PUT /pins` — replace the whole list; the response is the deduped, persisted list.
