# TODO Widget Second Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Bridge TODO widget into a list of mention-carrying notes. The list sits above
a chat-style composer, and each item can be deleted or implemented: Implement prefills
`/work/tasks/new`. An item disappears automatically once a task is created from it.

**Architecture:**

- A new file-backed `todo` resource: contract plus a NestJS store, controller and module that
  mirror `quick-actions`.
- The create-task body gains `todoId`, and the tasks service deletes that item after creation.
- The web widget is rewritten over `CommandLine` (chat configuration), and `NewTaskScreen` honours
  `?title=` and `?todo=`.

**Tech Stack:** Zod 4, ts-rest, NestJS, Next.js 15, TanStack Query, next-intl, DS.

**Spec:** `docs/superpowers/specs/todo-17.md` is binding. The exact copy, limits, ordering and
rulings are there.

## Global Constraints

- pnpm only. No `any`. No `forwardRef`. No inline `style` on DOM in `apps/web`. All strings go
  through next-intl in cs and en. DS testid enums are the test selectors.
- Never touch the real `.zibby/data`; tests use temp data dirs. The one exception is the
  regenerated `self-knowledge.md` when the pre-commit gate demands it: run `graphify update .`,
  then `pnpm self-knowledge:generate`, and stage it. Follow docs-sync and check:names.
- Run prettier and eslint on changed files and the related tests only. Run `tsc` per touched
  project (`rtk proxy`, check the exit code). Never use `--no-verify`. Commits end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A failed TODO delete after task creation never turns a successful task create into an error.
  (Task 1 test.)
- Two concurrent POSTs both persist: the writes are serialised. (Task 1 test.)
- A `todo` param pointing to an already-deleted item still creates the task. (Task 1 test.)
- Implement on an item whose text contains `&`, `#` or a newline round-trips exactly into the
  brief: everything is URL-encoded. (Task 2 test.)
- Delete or Implement clicks never trigger anything else on the row. (Task 2 test.)

---

### Task 1: API — `todo` resource, `todoId` on task create, old endpoint removed

**Files:**

- Create:
  - `libs/contracts/src/todo/todo.schema.ts` and `todo.contract.ts`, plus tests, exported from
    `libs/contracts/src/index.ts` and mounted in the root contract;
  - `apps/api/src/todo/` (store, controller, module, tests), registered in the app module;
  - `docs/api/todo.md`.
- Modify:
  - `libs/contracts/src/tasks/task.schema.ts`: `todoId` on the create body;
  - the tasks service create path;
  - remove `inboxContract.listTodoItems` and its API implementation, tests and docs (grep
    `listTodoItems`, `roadmap/todo`).

**Interfaces (produced):**

- `TodoItem`, `todoContract` with `listTodo` / `createTodo` / `deleteTodo`, and `TODO_MAX_ITEMS = 200`.
- `TodoStore.list()`, `create(text)` and `remove(id): Promise<boolean>`.
- `CreateTaskInput.todoId?: string`.

- [ ] **Step 1: Failing tests.**
  - Schema: blank or whitespace text is rejected, text is trimmed, 2001 characters are rejected,
    and the body is strict.
  - Store (temp dir): a missing file reads as `[]`; create/list/remove; oldest first; the
    201st item → a cap error; two concurrent creates both persist.
  - Controller or e2e:
    - POST 201;
    - blank → 400;
    - DELETE 204, then 404;
    - past the cap → 409.
  - Tasks:
    - a create with `todoId` removes that item;
    - an unknown `todoId` still creates the task;
    - a throwing `remove` still returns the created task (and logs).
- [ ] **Step 2:** Implement until green. Run the related suites (tasks, inbox, todo) and `tsc`
      for contracts, api and web (web will break where `useTodoItemsQuery` is used: delete that
      hook and leave `TodoWidget` compiling with a minimal stub only if needed, since Task 2
      rewrites it; prefer simply adding the new query/mutation hooks here if that keeps web green).
- [ ] **Step 3:** Commit `feat(todo): file-backed TODO notes API; a task created from a note removes it`.

### Task 2: Web — widget rewrite and `NewTaskScreen` prefill

**Files:**

- Modify:
  - `apps/web/features/bridge/widgets/TodoWidget.tsx` (+ test);
  - `apps/web/features/tasks/screens/NewTaskScreen.tsx` (+ test);
  - i18n cs/en (`bridge.widget.todo.desc`, `bridge.widgets.todo.*`, removing the unused keys).
- Create:
  - `apps/web/features/todo/queries/useTodoQuery.ts`;
  - `apps/web/features/todo/mutations/useCreateTodoMutation.ts` and `useDeleteTodoMutation.ts`;
  - `apps/web/features/todo/todoTaskTitle.ts` (+ test).

  Follow the CLAUDE.md TanStack conventions. If Task 1 already created any of these, reuse them.

- [ ] **Step 1: Failing tests.**
  - `todoTaskTitle`: first non-empty line, whitespace collapsed, 80-character cut with "…",
    tokens kept.
  - Widget:
    - rows render above the composer, oldest first;
    - no project select exists;
    - submit POSTs the text, and blank does not;
    - Delete calls DELETE for that id only;
    - Implement pushes `/work/tasks/new?text=…&title=…&todo=<id>`, and a text with `&`, `#` and
      a newline round-trips through `URLSearchParams`;
    - the buttons don't fire anything else;
    - the count is the number of items, and the widget is never reported empty.
  - `NewTaskScreen`:
    - `?title=` seeds the title;
    - `?todo=` puts `todoId` in the create body and invalidates the TODO query on success;
    - typed-mention adoption from a prefilled brief is pinned by a test, or recorded as a ruling
      (spec requirement 6).
- [ ] **Step 2:** Implement until green. `tsc -p apps/web/tsconfig.json --noEmit` exits 0.
- [ ] **Step 3:** Commit `feat(web): TODO widget — mentions like chat, delete, Implement prefills a new task`.
