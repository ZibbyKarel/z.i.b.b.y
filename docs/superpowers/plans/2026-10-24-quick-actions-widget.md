# Quick Actions Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Bridge widget `quickActions` listing operator-saved one-click tasks. "Run" enqueues a task immediately through the existing `createTask`; in board edit mode, actions can be added and removed.

**Architecture:** A new small file-backed resource, cloned from `pins` (`libs/contracts/src/pins`, `apps/api/src/pins`, `apps/api/test/pins.e2e.test.ts`): a schema, a contract with `GET` and `PUT` of the whole list, a store, a controller, a module and an e2e test. The web side adds a query and a mutation under `apps/web/features/quick-actions/`, plus `QuickActionsWidget` registered in the Bridge widget registry. Running an action reuses `useCreateTaskMutation` (`features/tasks/mutations`).

**Tech Stack:** ts-rest + Zod 4, NestJS, Next.js 15 / React 19 / TanStack Query / next-intl, DS `BoardRow` (with the `action` slot), `BoardText`, `BoardLine`, `Button`, `TextInputField`, `TextAreaField`, `Dropdown`, `Container`, `Stack`.

**Spec:** `docs/superpowers/specs/todo-9.md`

## Global Constraints

- Use pnpm only. Validate each touched file with `pnpm exec prettier --write <f>` and `pnpm exec eslint --fix <f>`, and run only the related tests.
- No `any`, no `forwardRef`, and no inline `style={{}}` on DOM nodes in `apps/web`. Compose from DS primitives.
- Every visible string goes through next-intl, in both `apps/web/i18n/messages/cs.json` and `en.json`.
- File: `process.env.QUICK_ACTIONS_FILE ?? dataDir("quick-actions.json")`.
- Limits: list max 50, `label` trimmed 1–80, `text` 1–8000, `id` 1–64.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Worktree commits: if the pre-commit self-knowledge gate blocks, run `pnpm self-knowledge:generate`, stage `.zibby/data/vault/knowledge/self-knowledge.md`, and retry. `graphify-out/` is already copied into the worktree.

## Review Focus

- A corrupt or missing `quick-actions.json` → `GET` returns `[]` and never a 500. Covered by a Task 1 store test.
- Whitespace-only label or text → Add is disabled and nothing is sent. Covered by a Task 2 test.
- A double-click on Run while the request is pending → only one task is created (the button is disabled while pending). Covered by a Task 2 test.
- Removing one action keeps the others in order. Covered by a Task 2 test.
- A target is sent exactly as stored, and "Automaticky" sends no `target` key at all. Covered by Task 2 tests.

---

### Task 1: Contract + API resource `quick-actions`

**Files:**

- Create: `libs/contracts/src/quick-actions/quick-action.schema.ts`, `libs/contracts/src/quick-actions/quick-actions.contract.ts`, `libs/contracts/src/quick-actions/quick-action.schema.test.ts`
- Modify: `libs/contracts/src/index.ts` (export both), `libs/contracts/src/app.contract.ts` (`quickActions: quickActionsContract`)
- Create: `apps/api/src/quick-actions/quick-actions.store.ts`, `quick-actions.controller.ts`, `quick-actions.module.ts`, `quick-actions.store.test.ts`
- Modify: `apps/api/src/app.module.ts` (import `QuickActionsModule`)
- Create: `apps/api/test/quick-actions.e2e.test.ts`

**Interfaces:**

- Produces:
  - `QuickActionTargetSchema = z.discriminatedUnion("kind", [AgentTaskTargetSchema, WorkflowTaskTargetSchema])`.
  - `QuickActionSchema = z.object({ id: z.string().min(1).max(64), label: z.string().trim().min(1).max(80), text: z.string().min(1).max(8000), target: QuickActionTargetSchema.optional() })`.
  - `QuickActionsSchema = z.array(QuickActionSchema).max(50)`.
  - Types `QuickAction`, `QuickActions`, `QuickActionTarget`.
  - `quickActionsContract`:
    - `getQuickActions`: `GET /quick-actions` → `200: QuickActionsSchema`.
    - `putQuickActions`: `PUT /quick-actions`, body `QuickActionsSchema` → `200: QuickActionsSchema`.
    - Options: `pathPrefix "/api"`, `strictStatusCodes: true`.
  - `QuickActionsStore.read(): Promise<QuickActions>` and `QuickActionsStore.write(next): Promise<QuickActions>` (deduped by `id`, last wins). Injection token `QUICK_ACTIONS_FILE`.

- [ ] **Step 1: Failing tests.**
  - Schema test cases:
    - It accepts `{id:"a",label:"Deploy",text:"Run deploy"}`.
    - It accepts the same object with `target:{kind:"agent",id:"coder",name:"Kodér"}`.
    - It rejects label `"   "`.
    - It rejects `target:{kind:"goal",id:"g",name:"G"}`.
    - It rejects 51 items.
  - Store test, mirroring `pins.store.test.ts`:
    - A missing file → `[]`.
    - A corrupt JSON file → `[]`.
    - Write then read on a fresh store → round-trips.
    - Duplicate ids → last wins, at the first occurrence's position or the last's; match the pins store's Map semantics.
  - e2e test, mirroring `pins.e2e.test.ts` with `QUICK_ACTIONS_FILE` set:
    - `GET` → `[]`.
    - `PUT` two actions → 200 with the same body.
    - `GET` returns them.
    - `PUT` with label `""` → 400.
- [ ] **Step 2:** `pnpm exec vitest run libs/contracts/src/quick-actions apps/api/src/quick-actions apps/api/test/quick-actions.e2e.test.ts` → FAIL.
- [ ] **Step 3: Implement**, cloning the pins files (store, controller, module, and the `resolveQuickActionsFile()` factory). Keep the comment style of those files (English is fine).
- [ ] **Step 4:** Re-run → PASS. Then run `pnpm exec tsc -p apps/api/tsconfig.json --noEmit` (or the api tsconfig that exists) → clean.
- [ ] **Step 5: Commit** `feat(api): quick-actions resource — file-backed one-click task definitions`.

### Task 2: Web hooks + `QuickActionsWidget`

**Files:**

- Create: `apps/web/features/quick-actions/queries/useQuickActionsQuery.ts`, `queries/index.ts`, `mutations/useSetQuickActionsMutation.ts`, `mutations/index.ts`
- Create: `apps/web/features/bridge/widgets/QuickActionsWidget.tsx`, `QuickActionsWidget.test.tsx`
- Modify: `libs/contracts/src/system/system.schema.ts:15` (add `"quickActions"` to the widget `type` enum — done here, not in Task 1, so every commit typechecks), `apps/web/features/bridge/widgets/registry.tsx` (add `quickActions` after `todo`), `apps/web/i18n/messages/cs.json`, `en.json`

**Interfaces:**

- Consumes:
  - Task 1's types and the `apiClient.quickActions.*` routes.
  - `useCreateTaskMutation()` (`features/tasks/mutations`), called as `.mutate({ body: CreateTaskInput }, { onSuccess })`.
  - `useAgentsQuery()` (`features/agents/queries`, data = agents with `id`, `name`, optional `glyph`).
  - `useWorkflowsQuery()` (`features/workflows/queries`; check its `select` output shape for `id`/`name`).
  - `makeInvalidatingMutation` (`state/makeInvalidatingMutation`), used exactly as in `features/pins/mutations/useSetPinsMutation.ts`.
- Produces:
  - `getQuickActionsQueryKey(): readonly ["quick-actions"]`.
  - `useQuickActionsQuery()`, which uses `select: selectApiResponseBody`.
  - `useSetQuickActionsMutation`.
  - `export function QuickActionsWidget(props: BridgeWidgetProps)`.
  - `export enum QuickActionsWidgetTestId { Run = "quick-actions-run", Remove = "quick-actions-remove", Label = "quick-actions-label", Text = "quick-actions-text", Target = "quick-actions-target", Add = "quick-actions-add" }`.
- i18n keys:
  - Catalog: `bridge.widget.quickActions.label` = "Rychlé akce" / "Quick actions" and `bridge.widget.quickActions.desc`, both copied verbatim from the spec.
  - Namespace `bridge.widgets.quickActions`:

    | Key                | cs                      | en                     |
    | ------------------ | ----------------------- | ---------------------- |
    | `run`              | "Spustit"               | "Run"                  |
    | `runLabel`         | "Spustit {label}"       | "Run {label}"          |
    | `remove`           | "Odebrat"               | "Remove"               |
    | `removeLabel`      | "Odebrat {label}"       | "Remove {label}"       |
    | `auto`             | "Automaticky"           | "Auto"                 |
    | `queued`           | "Zařazeno do fronty"    | "Queued"               |
    | `label`            | "Název"                 | "Label"                |
    | `labelPlaceholder` | "Např. Nasadit staging" | "E.g. Deploy staging"  |
    | `text`             | "Zadání"                | "Task"                 |
    | `textPlaceholder`  | "Co se má udělat…"      | "What should be done…" |
    | `target`           | "Cíl"                   | "Target"               |
    | `add`              | "Přidat"                | "Add"                  |

Layout and behaviour (spec §3–5):

- One row per action, through a `QuickActionRow` subcomponent:
  - `<BoardRow tone="idle" rowKey={`${widget.id}:${a.id}`} action={…}>`, with no `onClick`.
  - Body: `BoardText kind="title"` showing the label, then `BoardLine indent={false}` with `BoardText kind="meta" tone="ink3"` showing `queued ? t("queued") : a.target?.name ?? t("auto")`.
  - Each row owns its own `useCreateTaskMutation()` so its pending state stays per row.
- Run calls `create.mutate({ body: { title: a.label, text: a.text, ...(a.target ? { target: a.target } : {}) } }, { onSuccess: () => setQueued(true) })`. The button is `disabled={create.isPending}` and `size="sm"`, with `intent="ghost"` and `icon="play"`.
- With `editing`, the action is Remove (`icon="trash"`). It calls `set.mutate({ body: actions.filter(x => x.id !== a.id) })`.
- With `editing`, the add form (`Container as="form"`) goes below the rows:
  - `TextInputField` for the label and `TextAreaField` for the text, both with `hideLabel` if supported (otherwise with their label).
  - A `Dropdown` for the target. Its options are `[{ value: "", label: t("auto") }, ...agents.map(a => ({ value: `agent:${a.id}`, label: a.name })), ...workflows.map(w => ({ value: `workflow:${w.id}`, label: w.name }))]`.
  - An Add button, `type="submit"`, disabled while either field is blank after trimming.
  - Submit sends `set.mutate({ body: [...actions, { id: newId(), label: label.trim(), text: text.trim(), ...(target ? { target } : {}) }] }, { onSuccess: reset })`, where `target` is resolved from the selected option to `{ kind, id, name }`.
  - `newId()` = `` `qa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` ``.
- Reporting goes through `useWidgetReport({ loading: query.isPending, count: actions.length, you: 0 }, { onEmptyChange, onCountChange })`. Check that `useWidgetReport` derives `empty` from `count === 0 && !loading`; if not, call `onEmptyChange` directly in an effect, as `TodoWidget` does.

- [ ] **Step 1: Failing tests** in `QuickActionsWidget.test.tsx`. Mock `../../quick-actions/queries`, `../../quick-actions/mutations`, `../../tasks/mutations`, `../../agents/queries` and `../../workflows/queries` with `vi.hoisted` state, following `TodoWidget.test.tsx`, and use `renderWithProviders` with the same vitest project as `TodoWidget.test.tsx`.
  - `lists actions with target name or Auto` — 2 actions, one with an agent target named "Kodér" → 2 `BoardRowTestId.Root`, and the texts include both labels, "Kodér" and the `auto` string.
  - `Run enqueues the task with the stored target` → create mutate called with `{ body: { title: "Deploy", text: "Run deploy", target: { kind: "agent", id: "coder", name: "Kodér" } } }`.
  - `Run without target sends no target key` → assert `"target" in body === false`.
  - `Run is disabled while pending` → with create `isPending: true`, the Run button is disabled.
  - `shows Queued after a successful run` → invoke the `onSuccess` passed to mutate, then the row shows the `queued` string.
  - `not editing: no add form and no remove` → `queryByTestId(Add)` and `queryByTestId(Remove)` are null.
  - `editing: Remove drops only that action` → set mutate called with the remaining actions, in order.
  - `editing: Add appends a trimmed action with the chosen target` → type label " Deploy " and text "Run deploy", choose `agent:coder`, submit → set mutate body has length = old length + 1, and its last item matches `{ label: "Deploy", text: "Run deploy", target: { kind: "agent", id: "coder", name: "Kodér" } }` with `id` matching `/^qa-/`.
  - `editing: blank label or text disables Add` → with label `"  "` and some text, Add is disabled and mutate is not called on submit.
  - `reports empty with no actions` → `onEmptyChange` last called with `true`; with 1 action → `false`.
- [ ] **Step 2:** Run the tests → FAIL.
- [ ] **Step 3:** Implement the hooks, the widget, the registry entry and the i18n keys.
- [ ] **Step 4:** Tests PASS. Also run `apps/web/features/bridge` (including `widgets.test.tsx`, which iterates all widget types) → PASS. `pnpm exec tsc -p apps/web/tsconfig.json --noEmit` → clean.
- [ ] **Step 5: Commit** `feat(web): Bridge Quick actions widget — one-click tasks straight into the queue`.
