# TODO 9 — Widget QuickActions

**Raw TODO item:** Widget QuickActions: úlohy spustitelné jedním tlačítkem, které se rovnou zařadí do fronty

## Interpretation (night-run rulings, operator asleep)

- A **quick action** is a saved task definition (label + task text + optional explicit target
  agent/workflow). One click creates a task from it via the existing `POST /api/tasks`
  (`createTask`) with no `scheduledAt`, so it goes straight into the run queue. Nothing new runs
  tasks; the widget only reuses the normal path, gates included.
- The definitions are operator-owned data, so they live in a file (Law 2): `data/quick-actions.json`,
  following the same pattern as `data/pins.json` (one small document, `GET` reads it and `PUT`
  replaces the whole list).
- "Rovnou do fronty" means there is no confirm dialog. The click is the confirmation. Gates still
  apply downstream, as for any task.

## Requirements

1. Contract-first resource `quickActionsContract`, mounted as `quickActions` in the app contract:
   - `GET /api/quick-actions` returns `QuickAction[]`. A missing or corrupt file returns `[]`.
   - `PUT /api/quick-actions` replaces the list and returns it. It is deduped by `id`, last
     occurrence wins.
   - `QuickActionSchema`:
     - `id`: string, 1–64 characters.
     - `label`: string, trimmed, 1–80 characters.
     - `text`: string, 1–8000 characters (same bound as `CreateTaskInputSchema.text`).
     - `target`: optional, either `AgentTaskTargetSchema` or `WorkflowTaskTargetSchema`. It carries
       `name` for display; dispatch uses `id`.
   - The list holds at most 50 items.
   - Stored at `process.env.QUICK_ACTIONS_FILE ?? dataDir("quick-actions.json")`.
2. New Bridge widget type `quickActions`:
   - Catalog label: cs "Rychlé akce", en "Quick actions".
   - Catalog desc: cs "Úlohy spustitelné jedním tlačítkem — rovnou do fronty", en "One-click tasks
     — straight into the queue".
3. Each action renders as one row (`BoardRow`, not clickable itself, `rowKey`
   `${widget.id}:${action.id}`):
   - The title is the label.
   - The meta line shows the target name, or cs "Automaticky" / en "Auto" when there is no target.
   - The row's `action` slot holds a "Spustit" / "Run" button (icon `play`). Clicking it calls
     `createTask` with `{ title: label, text, target }`. While that request is pending the button
     is disabled.
   - After a successful run, the row's meta line shows cs "Zařazeno do fronty" / en "Queued" in
     place of the target name, until the next run attempt.
4. Board edit mode (`editing` true):
   - Each row's action becomes "Odebrat" / "Remove" (icon `trash`), which removes the action from
     the list via `PUT`.
   - Below the rows sits an add form with these fields:
     - Label input.
     - Task text area.
     - Target dropdown: "Automaticky" plus every agent and workflow from the existing queries.
     - "Přidat" / "Add" button. It is disabled while the label or text is blank after trimming.
   - Adding appends a new action with a client-generated id and clears the form.
5. Header: `count` is the number of actions and `you` is 0. The widget reports empty when there are
   no actions. It then collapses outside edit mode, and in edit mode the add form is still shown.
6. Every visible string goes through next-intl, in both cs and en.
