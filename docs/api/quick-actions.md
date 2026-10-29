# Quick actions (Bridge one-click tasks)

The **quick-actions** module backs the Bridge "Quick actions" widget: operator-defined
buttons, each a label plus the task text to enqueue (optionally routed to a fixed agent
or workflow). Like pins, it is one small operator-owned list persisted as a single file
(`data/quick-actions.json`) — the same slot as `PinsStore` (`docs/api/pins.md`).

## Pieces

| Piece      | File                                                         | Role                                                                                                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract   | `libs/contracts/src/quick-actions/quick-action.schema.ts`    | `QuickActionSchema` (`{ id, label, text, target?, automationId?, immediate? }`; `automationId` pins the action to an automation, whose label/text/target are then read live, `immediate` runs the task past the concurrency caps), `QuickActionTargetSchema` (agent \| workflow), `QuickActionsSchema` (max 50) |
| Contract   | `libs/contracts/src/quick-actions/quick-actions.contract.ts` | `quickActionsContract` — `getQuickActions` / `putQuickActions` under `/api/quick-actions`                                                                                                                                                                                                                       |
| Store      | `apps/api/src/quick-actions/quick-actions.store.ts`          | `QuickActionsStore` — synchronous load, atomic writes, dedupe by `id` (last wins)                                                                                                                                                                                                                               |
| Controller | `apps/api/src/quick-actions/quick-actions.controller.ts`     | implements `quickActionsContract`                                                                                                                                                                                                                                                                               |
| Module     | `apps/api/src/quick-actions/quick-actions.module.ts`         | resolves `QUICK_ACTIONS_FILE` (`$QUICK_ACTIONS_FILE` env or `data/quick-actions.json`)                                                                                                                                                                                                                          |

## Flow

1. The store loads the file at construction; a missing or corrupt file yields `[]`.
2. `PUT` replaces the whole list: validated, deduped by `id` (last occurrence's value wins),
   written atomically, cached in memory.
3. Running an action is a client concern — the web widget creates a normal task from `text`
   (and `target`, when set, and `immediate: true` when the action has it); this resource only stores the definitions.
