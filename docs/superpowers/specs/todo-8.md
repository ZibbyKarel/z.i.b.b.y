# TODO 8 — Widget TODO na dashboardu

**Raw TODO item:** Widget TODO na dashboardu: rychlé přidávání položek k implementaci s přiřazením cíle

## Interpretation (night-run rulings, operator asleep)

- "Položka k implementaci" = a **manual roadmap task** (`source.kind: "manual"`, `level: "task"`), the
  existing 125f concept that a project's gate can `play` (enqueue → task → PR).
- "Přiřazení cíle" = choosing the **target project** the item lands in (same meaning as the NewTask
  dialog's "Cíl" — where the work goes).
- The Inbox / Issues widget deliberately excludes manual items (`inbox.service.ts` `listItems` skips
  `source.kind === "manual"`), so manual items currently have no dashboard home. The TODO widget is it.

## Requirements

1. New Bridge widget type `todo` (catalog label cs "TODO", en "TODO"; desc cs "Rychlé přidání položek
   k implementaci do projektu", en "Quick-add items to implement into a project").
2. Quick-add line at the top of the widget body: a text input (placeholder cs "Co implementovat…",
   en "What to implement…"), a target-project select, and an "Přidat"/"Add" button. Enter in the input
   submits. Empty/whitespace text never submits. On success the input clears and keeps focus; the
   chosen project stays selected.
3. The last chosen target project is remembered per viewer (`localStorage` key
   `zibby.bridge.todo.target`, try/catch guarded); default = first project in the projects list.
   With no projects at all, the form is replaced by a one-line hint (cs "Nejdřív založ projekt",
   en "Create a project first").
4. Creation uses the existing `POST /api/projects/:projectId/roadmap/items` with
   `{ level: "task", name }`.
5. Contract-first new endpoint `GET /api/roadmap/todo` (`inboxContract.listTodoItems`) returning
   `{ items: InboxRoadmapItem[] }`: every project's manual, task-level items whose lifecycle is not
   `archived` and not `done`, `hidden: false`, newest `createdAt` first.
6. Rows (one per item, `BoardRow`, `data-rk` = `${widget.id}:${projectId}/${itemId}`): title; meta
   line `<lifecycle state label> · <project name>` and compact age on the right. Lifecycle `todo`
   rows carry a "Implementovat"/"Implement" action that calls the existing `play` route
   (`POST /api/projects/:projectId/roadmap/items/:itemId/play`); other lifecycles show only their state.
   Row click navigates to `/projects/<projectId>/roadmap`.
7. Header count = number of rows; `you` = 0. The widget is **never** reported empty while the quick-add
   form is available (an empty TODO widget must still offer the input) — it collapses only when there
   are no projects and no items.
8. Creating or playing invalidates the TODO list query.
