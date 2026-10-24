# TODO notes (Bridge TODO widget)

The **todo** module backs the Bridge TODO widget: the operator's own quick notes, each
`{ id, text, createdAt }`. A note is NOT a roadmap item — it needs no project, and its `text`
carries the same `@Name` / `#Name` / `/Name` mention tokens the chat composer writes.

## Pieces

| Piece      | File                                       | Role                                                                                            |
| ---------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Contract   | `libs/contracts/src/todo/todo.schema.ts`   | `TodoItemSchema`, `CreateTodoBodySchema` (strict, trimmed 1–2000 chars), `TODO_MAX_ITEMS = 200` |
| Contract   | `libs/contracts/src/todo/todo.contract.ts` | `todoContract` — `listTodo` / `createTodo` / `deleteTodo` under `/api/todo`                     |
| Store      | `apps/api/src/todo/todo.store.ts`          | `TodoStore` — file re-read per call, atomic write, writes serialised by a path lock             |
| Controller | `apps/api/src/todo/todo.controller.ts`     | implements `todoContract`                                                                       |
| Module     | `apps/api/src/todo/todo.module.ts`         | resolves `TODO_FILE` (`$TODO_FILE` env or `data/todo/items.json`); exports `TodoStore`          |

## Endpoints

- `GET /api/todo` → 200 `{ items }`, oldest `createdAt` first. A missing file is `[]`; invalid records are skipped.
- `POST /api/todo` `{ text }` → 201 `TodoItem` (id `todo_<hex>`); blank text → 400; past 200 notes → 409.
- `DELETE /api/todo/:id` → 204, or 404 when the note does not exist.

## Task link

`POST /api/tasks` accepts an optional `todoId`. After the task is created (whatever state it
starts in) `TaskSchedulerService` calls `TodoStore.remove(todoId)`; a missing note is ignored and
a failure is logged, never thrown. See `docs/api/tasks.md`.

## Damaged file

Reads salvage valid records one by one. Before a write replaces a file that was unparseable
(renamed to `items.json.corrupt-<ts>`) or held invalid records (copied to the same sidecar name),
the original is preserved and a warning is logged.
