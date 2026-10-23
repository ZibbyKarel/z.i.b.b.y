# Bridge TODO Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Bridge dashboard widget `todo` that quick-adds manual roadmap tasks into a chosen target project and lists the open manual tasks across projects, with a one-click "Implement" (play).

**Architecture:** Contract-first: new `inboxContract.listTodoItems` (`GET /api/roadmap/todo`) served by `InboxService.listTodoItems()` reusing the same project walk as `listItems()` but keeping only manual tasks. Web: a query hook in `features/inbox/queries`, a `TodoWidget` in `features/bridge/widgets` registered under a new widget type `todo` (contract enum), reusing the existing roadmap `createRoadmapItem` / `playRoadmapItem` mutations.

**Tech Stack:** ts-rest + Zod 4 (`libs/contracts`), NestJS (`apps/api`), Next.js 15 / React 19 / TanStack Query / next-intl (`apps/web`), DS `BoardRow`/`BoardText`/`BoardLine` + form fields.

**Spec:** `docs/superpowers/specs/todo-8.md`

## Global Constraints

- pnpm only; validate per-file (`pnpm exec prettier --write <f>`, `pnpm exec eslint --fix <f>`) and run only the related test file.
- No `any`, no `forwardRef`, no inline `style={{}}` on DOM nodes in `apps/web`; compose from DS primitives, no app Tailwind classes.
- i18n: every visible string via next-intl in both `apps/web/i18n/messages/cs.json` and `en.json`.
- localStorage key exactly `zibby.bridge.todo.target`; every read/write wrapped in try/catch.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pre-commit hook may regenerate self-knowledge / require `graphify update .` — if a commit is blocked by the self-knowledge gate, run `graphify update .` then the regeneration the hook names, stage, and retry.

## Review Focus

- Whitespace-only text → no request is sent (Task 3 test `does not submit blank text`).
- Stored target project id that no longer exists → falls back to first project (Task 3 test `falls back when the stored target is gone`).
- localStorage throwing (private mode) → widget still renders and submits (Task 3 test `survives a throwing localStorage`).
- Archived / done / non-manual / epic items never appear (Task 1 test).
- No projects at all → hint instead of the form, widget reported empty only when also no items (Task 3 test).

---

### Task 1: Contract + API `GET /api/roadmap/todo`

**Files:**

- Modify: `libs/contracts/src/inbox/inbox.schema.ts` (add `TodoItemsResponseSchema`)
- Modify: `libs/contracts/src/inbox/inbox.contract.ts` (add `listTodoItems`)
- Modify: `libs/contracts/src/system/system.schema.ts:15` (add `"todo"` to `BridgeWidgetSchema.type`)
- Modify: `apps/api/src/inbox/inbox.service.ts` (add `listTodoItems()`)
- Modify: `apps/api/src/inbox/inbox.controller.ts` (wire handler)
- Test: `apps/api/src/inbox/inbox.service.test.ts`, `apps/api/src/inbox/inbox.controller.test.ts`

**Interfaces:**

- Produces: `TodoItemsResponseSchema = z.object({ items: z.array(InboxRoadmapItemSchema) })`, `type TodoItemsResponse`; contract route `inboxContract.listTodoItems` `{ method: "GET", path: "/roadmap/todo", responses: { 200: TodoItemsResponseSchema } }`; `InboxService.listTodoItems(): Promise<TodoItemsResponse>`; widget type union now includes `"todo"`.

- [ ] **Step 1: Failing service test** in `inbox.service.test.ts`, following that file's existing fixtures for `listItems`: `listTodoItems returns only open manual tasks, newest first` — given one project with items: manual task `todo` (createdAt T1), manual task `running` (createdAt T2 > T1), manual task `done`, manual task `archived`, manual epic, jira task with scopeReasons → result ids equal `[running-id, todo-id]`, each with `project: { id, name }` and `hidden: false`.
- [ ] **Step 2: Failing controller test** in `inbox.controller.test.ts` following its existing pattern: `GET /roadmap/todo` returns 200 with the service body.
- [ ] **Step 3: Run both** — `pnpm exec vitest run apps/api/src/inbox/inbox.service.test.ts apps/api/src/inbox/inbox.controller.test.ts` → FAIL.
- [ ] **Step 4: Implement** schema, contract route (place it right after `listInboxItems`; static `/roadmap/todo` path cannot collide with `/projects/:projectId/...`), widget enum, service method (iterate `this.projects.list()`, `this.roadmap.list(project.id)`, filter `source.kind === "manual" && level === "task" && lifecycle !== "archived" && lifecycle !== "done"`, map with `project` + `...orgOf(project)` + `hidden: false`, sort by `createdAt` desc), controller handler `listTodoItems: async () => ({ status: 200, body: await this.inbox.listTodoItems() })`.
- [ ] **Step 5: Run tests** → PASS. Also `pnpm exec tsc -p libs/contracts/tsconfig.lib.json --noEmit` (or the contracts tsconfig present) clean.
- [ ] **Step 6: Commit** `feat(api): list open manual roadmap tasks for the TODO widget`.

### Task 2: Web query + widget registration scaffolding

**Files:**

- Create: `apps/web/features/inbox/queries/useTodoItemsQuery.ts` (+ export from `queries/index.ts`)
- Modify: `apps/web/features/roadmap/mutations/useCreateRoadmapItemMutation.ts`, `usePlayRoadmapItemMutation.ts` — additionally invalidate `getTodoItemsQueryKey()`
- Modify: `apps/web/features/bridge/widgets/registry.tsx` (add `todo` entry with `TodoWidget`)
- Modify: `apps/web/i18n/messages/cs.json`, `en.json` (`bridge.widget.todo.label/desc` + `bridge.widgets.todo.*`)

**Interfaces:**

- Produces: `getTodoItemsQueryKey(): readonly ["inbox", "todo"]`; `useTodoItemsQuery()` → `apiClient.inbox.listTodoItems.useQuery({ queryKey, select: selectApiResponseBody })` (data = `TodoItemsResponse`).
- i18n keys (namespace `bridge.widgets.todo`): `placeholder` ("Co implementovat…" / "What to implement…"), `target` ("Cíl" / "Target"), `add` ("Přidat" / "Add"), `implement` ("Implementovat" / "Implement"), `noProjects` ("Nejdřív založ projekt" / "Create a project first"), `state.<lifecycle>` for every `RoadmapItemLifecycle` value except archived/done (copy the Czech labels the roadmap board already uses for those lifecycles if present, else: todo "K implementaci"/"To do", enqueued "Ve frontě"/"Queued", running "Běží"/"Running", failed "Selhalo"/"Failed", awaiting-merge "Čeká na merge"/"Awaiting merge", external "Mimo ZIBBY"/"External"). Catalog: `bridge.widget.todo.label` "TODO", `desc` per spec.

- [ ] **Step 1:** Implement the query file, mutation invalidations, i18n keys. Registry entry can point at a placeholder-free `TodoWidget` created in Task 3 — so do this task's registry edit together with Task 3's first commit if the import would otherwise break typecheck.
- [ ] **Step 2:** `pnpm exec vitest run apps/web/features/roadmap --project web` still green; i18n parity test (if the repo has one, e.g. a cs/en key-parity test) green.
- [ ] **Step 3: Commit** `feat(web): TODO items query`.

### Task 3: `TodoWidget`

**Files:**

- Create: `apps/web/features/bridge/widgets/TodoWidget.tsx`
- Create: `apps/web/features/bridge/widgets/TodoWidget.test.tsx`
- Modify: `apps/web/features/bridge/widgets/registry.tsx`

**Interfaces:**

- Consumes: `useTodoItemsQuery`, `useProjectsQuery` (`features/projects/queries`), `useCreateRoadmapItemMutation(projectId)`, `usePlayRoadmapItemMutation(projectId)` (check their signatures; if play is per-project-bound, render a small `TodoRow` subcomponent per row so each row binds its own project's hook), `useWidgetReport`, `compactAgo`, `useNow`.
- Produces: `export function TodoWidget(props: BridgeWidgetProps)`, `export enum TodoWidgetTestId { Input = "todo-widget-input", Target = "todo-widget-target", Add = "todo-widget-add", Implement = "todo-widget-implement", NoProjects = "todo-widget-no-projects" }`, `export const TODO_TARGET_STORAGE_KEY = "zibby.bridge.todo.target"`.

Layout: form line first (DS `TextInputField` / `SelectField` / `Button` inside a `Stack`/`Row` — whatever the DS form folder offers; `data-testid` wiring via the enum), then one `BoardRow` per item (`tone`: todo→`idle`, enqueued→`thinking`, running→`working`, failed→`error`, awaiting-merge→`blocked`, external→`neutral`), body = `BoardText kind="title"` + `BoardLine indent={false} end={age}` with state · project, and for `todo` a small `Button` "Implementovat" whose click calls play and does **not** trigger row navigation (stopPropagation). Row click → `router.push(\`/projects/${projectId}/roadmap\`)`, `rowKey` = `${widget.id}:${projectId}/${id}`. Report: `loading: todo query pending`, `count: items.length`but report **non-empty** whenever projects exist (pass`count: items.length || undefined`and call`onEmptyChange(false)`when projects exist — implement by computing`empty = !loading && items.length === 0 && projects.length === 0`and calling`onEmptyChange`directly in an effect rather than via`useWidgetReport`, while still calling `onCountChange`).

- [ ] **Step 1: Failing tests** (`TodoWidget.test.tsx`, mock `../../inbox/queries`, `../../projects/queries`, `../../roadmap/mutations` with `vi.hoisted` state like `widgets.test.tsx`; `renderWithProviders`):
  - `lists open manual items with state and project` — 2 items → 2 `BoardRowTestId.Root`, texts contain title, project name, state label.
  - `adds an item to the chosen target on Enter` — type "Fix login" + `{Enter}` → create mutate called with `{ params: { projectId: "p2" }, body: { level: "task", name: "Fix login" } }` after selecting project p2; input cleared after `onSuccess`.
  - `remembers the target project` — after choosing p2, `localStorage.getItem("zibby.bridge.todo.target") === "p2"`; a fresh render preselects p2.
  - `falls back when the stored target is gone` — storage "gone" → select value is first project id.
  - `does not submit blank text` — " " + Enter → mutate not called.
  - `survives a throwing localStorage` — `vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied") })` → renders, submit works.
  - `Implement plays a todo item without navigating` — click Implement → play mutate called with `{ params: { projectId, itemId } }` (match the hook's real shape), router push not called.
  - `row click opens the project roadmap` — router push `/projects/p1/roadmap`.
  - `no projects shows the hint` — `TodoWidgetTestId.NoProjects` present, `onEmptyChange` last called with `true` when also no items; with items and no projects → `false`.
- [ ] **Step 2:** run `pnpm exec vitest run apps/web/features/bridge/widgets/TodoWidget.test.tsx --project web-components` (use whichever vitest project `widgets.test.tsx` runs under — check `vitest.workspace`/config) → FAIL.
- [ ] **Step 3:** implement `TodoWidget.tsx`, register in `registry.tsx`.
- [ ] **Step 4:** tests PASS; `widgets.test.tsx` and `apps/web/features/bridge` tests still PASS; `pnpm exec tsc -p apps/web/tsconfig.json --noEmit` clean.
- [ ] **Step 5: Commit** `feat(web): Bridge TODO widget — quick-add with target project`.

### Task 4: Live verification

- [ ] Start (or reuse) the dev servers from this worktree is not possible on the shared ports; instead run `pnpm exec playwright`-free check: add the widget through the board's widget catalog in a jsdom test is already covered — so this task is: run `pnpm exec vitest run apps/web/features/bridge --project <web project>` and `pnpm exec vitest run apps/api/src/inbox` green, plus `pnpm exec eslint` on all touched files clean. Record results.
