# TODO 17 — Widget TODO, second pass

**Raw TODO item:** Widget TODO

- a. odstraníme selector na projekty a v inputu musí jít označovat všechno - projekty, firmy, agenti, workflows,... stejně jako v chatu.
- b. nemám možnost přidané položky smazat
- c. klik na tlačítko implementace musí otevřít stránku work/tasks/new s předvyplněnými hodnotami podle todo položky
- d. pokud se z TODO položky stane už běžící task (nebo task ve frontě) tak je z TODO seznamu automaticky smazána
- e. seznam přidaných položek by se měl zobrazit nad inputem

## Interpretation (night-run rulings, operator asleep)

Item 8 shipped the Bridge widget `todo`. It quick-adds **manual roadmap tasks** into one project
picked from a select, and its Implement button `play`s the roadmap item. This item reworks that
widget:

- **Ruling: a TODO item is a note of its own, not a roadmap item.** Once the project select goes
  away (a), an item can mention a company, an agent or a workflow and no project at all. A roadmap
  item always needs a project. So the widget gets its own small file-backed list: `{ id, text,
createdAt }`.
  - The mentions live in `text` as the same `@Name` / `#Name` / `/Name` tokens the chat composer
    writes.
  - Cost if wrong: manual roadmap items added through the old widget since last night no longer
    show in the widget. They are not deleted: they stay on their project's roadmap page.
- **Ruling: Implement prefills, it does not start anything.** It navigates to `/work/tasks/new`
  with the item's text and a derived title (c). The operator submits there, which is the normal
  gated create path.
- **Ruling: "becomes a running or queued task" means "a task was created from it".** When
  `/work/tasks/new` creates a task with the item's id, the server deletes the item. This holds
  whatever state the task starts in: queued, running, scheduled, or held for approval (d). Cost
  if wrong: an item whose task was then rejected at its gate is gone, and the operator re-adds it.
- **Ruling: the list reads like a chat transcript.** Oldest is at the top, newest sits directly
  above the composer (e).

## Requirements

1. **Contract** (`libs/contracts/src/todo/`, exported from the index), contract-first.
   - `TodoItemSchema = { id: string, text: string (trimmed, 1–2000 chars), createdAt: ISO datetime }`.
   - `todoContract`:
     - `GET /api/todo` → 200 `{ items: TodoItem[] }`, oldest `createdAt` first;
     - `POST /api/todo` with body `{ text }` (strict; trimmed; blank → 400) → 201 `TodoItem`;
     - `DELETE /api/todo/:id` → 204, or 404 when the item does not exist.
   - Mount it in the root contract like `quick-actions`.
2. **Store + API** (`apps/api/src/todo/`, mirroring `apps/api/src/quick-actions/`).
   - A file-backed store under the data dir, e.g. `todo/items.json`. It uses an atomic write,
     tolerates a missing file (treated as an empty list), and serialises concurrent writes.
   - Ids are server-generated and opaque (`todo_` + random). The list holds at most 200 items; a
     POST past the cap gets 409.
3. **Task link** (`libs/contracts/src/tasks/task.schema.ts`, the create-task body): optional
   `todoId: string`.
   - After a task is created successfully, the tasks service deletes that TODO item.
   - A missing item is ignored. A failed delete is logged and never fails task creation.
   - Nothing else about task creation changes: the gate, routing and scheduling stay as they are.
4. **Old path removed.**
   - Remove `GET /api/roadmap/todo` (`inboxContract.listTodoItems`), its service method, tests,
     docs and the web `useTodoItemsQuery`, unless something else uses them (grep first; keep what
     has another consumer).
   - The manual roadmap items themselves are untouched.
5. **Widget** (`apps/web/features/bridge/widgets/TodoWidget.tsx`, rewritten).
   - **Body order:** the item rows first (oldest → newest), then the composer.
   - **Composer:** the existing `CommandLine`, configured like the chat dock's composer, minus
     attachments:
     - `multipleTargets` (`@` agents / workflows / departments);
     - `scopeKinds` `["company", "team", "project"]` (`#`);
     - `allowSkillMentions` (`/`);
     - `chrome={false}`, `hideLabel`, `showAttach={false}`;
     - a trailing "Přidat"/"Add" button.

     Submit POSTs the composed text, and blank text never submits. The composer resets after a
     successful add (the default `resetOnSubmit`). The project select and its `localStorage` key
     are gone.

   - **Row** (`BoardRow`, `data-rk` = `${widget.id}:${item.id}`): the title is the item text; the
     compact age sits on the right of a meta line. The `action` slot holds two ghost buttons:
     - Implement (icon `play`, aria-label "Implementovat „{name}“");
     - Delete (aria-label cs "Smazat „{name}“" / en "Delete “{name}”").

     The row itself has no navigation. Both buttons stop propagation.

   - **Implement** → `router.push('/work/tasks/new?text=<enc text>&title=<enc title>&todo=<id>')`.
     The title is `todoTaskTitle(text)`, a pure helper:
     - take the first non-empty line;
     - collapse whitespace;
     - cut at 80 characters with a trailing "…";
     - keep the mention tokens.
   - **Delete** → `DELETE /api/todo/:id`, then invalidate the list. No confirm dialog: it is the
     operator's own note.
   - **Header:** count = number of items, `you` = 0. The widget is never reported empty, because
     the composer is always available.
   - **Catalog description:** cs "Rychlé poznámky k implementaci se zmínkami jako v chatu" / en
     "Quick notes to implement, with mentions like in chat".
   - **Placeholder:** cs "Co implementovat… (@ agent, # projekt)" / en "What to implement… (@ agent,
     # project)".

6. **`/work/tasks/new`** (`NewTaskScreen`).
   - `?title=` seeds the title field (`?text=` already seeds the brief).
   - `?todo=` is sent as `todoId` in the create body.
   - On success with a `todoId`, the TODO list query is invalidated before navigating.
   - Typed `@Name` / `#Name` tokens in a prefilled brief should be adopted the same way the
     composer adopts typed ones. If `CommandLine` already does this from `initialText`, add a test
     that pins it. If it does not, record a ruling: the text still carries the tokens and routing
     falls back to classification. Do not build a new parser for it.
7. **Docs:** add `docs/api/todo.md` (or the docs-sync equivalent), and remove the
   `/api/roadmap/todo` section.
