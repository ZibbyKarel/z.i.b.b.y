# Part B — Information architecture, pages, logic, settings, chains

**Branch:** `feat/zc-b-ia`, cut from the tip of Part A.
**Spec:** `ROUTE-MAP.md`, which is authoritative for where every screen, setting and
orphan goes. **Decisions:** D-001, D-002, D-003, D-005, D-009, D-011.
**Defaults:** see each phase.

**Screen phase recipe.** Every screen phase follows the same steps:

1. **Recon** (≤15 min). Read the mock section in the listed `.dc.html` and the current
   feature code, then list the DS components needed.
   - Any that are missing are added to the DS **first**, in their own `feat(ds)` commit
     (I-2).
2. **Build** the page: `apps/web/app/(company)/<route>/page.tsx` is a thin server
   component that renders `features/<domain>/screens/<Name>Screen.tsx`.
   - It is composed only from DS.
   - Data comes from the existing queries and mutations. New endpoints are contract-first.
3. **Move** the old feature code instead of copying it.
   - The old route becomes a redirect (ROUTE-MAP § 2) in the same commit.
   - Update e2e specs and page objects to the new route and test ids.
4. **Verify:**
   - `tsc -p apps/web`, the related unit tests and the related e2e spec.
   - A **live browser** check in light and dark at 1440 and 390 px.
   - A **design-match** against the mock (≤5 rounds; park on thrash, attaching the diff
     screenshots).
5. **Commit** once per screen: `feat(<section>): <screen> on ZibbyCorp shell`.

---

## ZB-01 — Route group, shell, redirects, light default

**Paths:**
- `apps/web/app/(company)/layout.tsx`, which replaces `(dashboard)/layout.tsx`.
- `apps/web/components/layout/AppShell/**`, rewritten over DS `AppFrame`.
- `apps/web/state/config.ts`: `NAV_ITEMS` → `SECTIONS`, a map of section → sub-tabs
  mirroring `ZibbyCorp App.dc.html` SECTIONS, adjusted by ROUTE-MAP:

  | Section | Sub-tabs |
  |---|---|
  | org | map, people |
  | work | tasks, chains, goals, companies, teams, projects |
  | activity | log, runs, inbox, briefings |
  | policy | approvals, gates, patterns |
  | knowledge | vault, distill |
  | ledger | budgets, spend |
  | system | settings, registries |

- `apps/web/next.config.*` for the redirects.
- `apps/web/app/page.tsx` → `redirect("/org")`.
- `apps/web/app/providers.tsx`.
- `libs/contracts/src/system` and `apps/api/src/system` for `operatorName?` and
  `companyName?` (O-21).

**Deliverables**

1. The AppShell renders `AppFrame` with:
   - `AppHeader`: section nav from `usePathname()`, the operator name, the active-run count
     from the existing runs query, limit bars from `useLimitsQuery`, the ⌘K trigger (a
     stub until ZB-12) and ⚙ → `/system/settings/general`.
   - `SubNav` plus `+ NEW TASK` → `/work/tasks/new`.
   - `Rail`: NEEDS YOU, listing `useApprovalsQuery` pending as `ApprovalCard`s.
     - Quick-approve for non-high-risk items.
     - For high-risk items and for "→", open `?approval=<id>` (the sheet is ZB-08; until
       then it links to the old approval surface).
   - The `dock` slot is empty until ZB-12.
2. Move all current `(dashboard)/*` segments into `(company)/` unchanged. The route group
   changes, but the old URLs keep rendering inside the new shell.
   - Each later screen phase builds its new route, then turns its old segment into a
     redirect per ROUTE-MAP § 2.
   - `/` and `/chat` redirect to `/org` from ZB-02 on.
3. `providers.tsx` sets `theme="system"` with the default light (O-01). Appearance settings
   arrive in ZB-11; until then, the header offers the toggle via the DS
   `ThemeToggle`.
4. `RunEventsProvider`, `CatalogProvider`, `VoiceProvider` and `NewTaskProvider` are kept
   and mounted in the new layout.
5. `BootSplash` → DS `Splash`.

**E2E:**
- The navigation spec is rewritten for sections and sub-tabs.
- A redirect spec loops over the ROUTE-MAP § 2 table.

**Commit:** `feat(web): ZibbyCorp shell — header, sections, NEEDS YOU rail, redirects`

---

## ZB-02 — ORG map (parallel with ZB-04a)

- **Mock:** `Org Screens.dc.html` → `org/map`.
- **Route:** `/org`.
- **Data:** `useDepartmentsQuery` (with status), roster per department, and the handoff
  IN/OUT from the existing handoff queries.

**Screen:**
- A CEO node (operator) → a COO node (Zibby) → 11 `OrgNode`s in canonical order.
- Each node's `cells` are the agent states derived by `deriveAgentState` (O-04; implement
  it in `features/departments/state/deriveAgentState.ts` with unit tests).
- `alert` shows the highest-severity pending item: an approval for the department, or an
  error run.
- A focus panel (`?focus=<id>`) shows the department's agents, open subtasks, and handoff
  IN/OUT rows. The live packet animates while the target subtask is `working`.
- Card click → `/org/departments/<id>`.

**Retires:** the `/chat` home as the landing page. The redirect goes to `/org`, and the
chat-screen code stays until ZB-13.

---

## ZB-03 — Department detail + People (parallel with ZB-05a)

**Mocks:** `Org Screens.dc.html` → `org/dept/:id` (7 tabs), `org/pool` (as the directory,
D-002), `org/agent/:id`.

**Department detail:** `/org/departments/[id]/[tab]`
- Header: `Breadcrumb`, code, name, mandate, and `MetricStrip` with the 4 KPIs (O-15).
  "REPORTS TO COO" is shown in mono.
- Tabs, per ROUTE-MAP § 1:

  | Tab | Content |
  |---|---|
  | team | That department's agents only (D-002). Card → profile. `+ HIRE` → `/org/people/new?department=<id>`. |
  | subtasks | Built in ZB-04b once the read model exists. Until then, an EmptyState. |
  | pipelines | Pipelines where `department === id`, as `PipelineStepStrip` cards. The card links to `/org/departments/[id]/pipelines/[pid]`, which hosts the **existing PipelineCanvas editor**, moved and re-skinned. Edit is top-right. |
  | handoff | Read-only IN/OUT rules and recent signals, linking to `/policy/gates?section=handoff&department=<id>`. **Chain-kind rules are shown grouped as "Chains through this department"** (D-005). |
  | skills, integrations, automations, hooks | Derived read-only "bound in" lists (O-09, D-011). A "Manage in registry →" link. |

- **The gates tab is not rebuilt.** Link to `/policy/gates?department=<id>` (O-27).
- **Delete** `features/departments/components/DepartmentDrawer/**` and its opening sites.

**People directory:** `/org/people`
- A `FilterBar` with department (SelectField), state (SegmentedControl) and role
  (SelectField over `title ?? category`), plus search.
- Grouped by department with a `SectionLabel` per department, and a `Legend` with counts.
- Pinned agents come first, with a star via the existing pins feature.

**Agent profile:** `/org/people/[id]`
- A hero `AgentGlyph` at 128, `StatePill`, department link, `title`.
- A current subtask card, when there is a running run.
- `LogStream` fed by the existing run-log SSE (`/api/tasks/runs/:runId/logs/stream`).
- `STOP RUN` (O-19).
- Config panel: the existing detail form. Edit is top-right. `department` is required.
- Rules panel: the existing `AgentRulesSection`.
- History: recent runs as a `DataTable`.
- Contract: add optional `displayName` and `title` to `AgentSchema` (O-03), and show them
  in the form.

**Create:** `/org/people/new`, moved from `/agents` create, with the department required
and prefilled from the query.

---

## ZB-04a — Tasks backend: parent, source, department stamp (parallel with ZB-02)

This phase is contract-first and additive (I-4).

**Paths:**
- `libs/contracts/src/tasks/**`
- `apps/api/src/tasks/**`
- the runner spawn site(s) for the department stamp

**Deliverables**

1. `ScheduledTaskSchema` and `CreateTaskInput` gain:
   - `parentTaskId?`
   - `chain?: {id, step}`
   - `source?` (O-18)
   - `department?`, set at dispatch when resolved (both the classifier and explicit target)
2. `TaskTargetSchema` gains `{kind: "chain", id}` (D-005). The **classifier never emits it**;
   add the same scope guard as for `department`.
3. Run records (`TaskRun`) gain `department?`, stamped at spawn time. This is used for spend
   by department (O-06) and activity filters.
4. The source is stamped at the existing creators:

   | Creator | Source |
   |---|---|
   | CommandLine / new task | `operator` |
   | department-target explicit | `department` |
   | channel triage | `channel` |
   | automations scheduler | `automation` |
   | HandoffService `dispatchTask` | `handoff`, or `chain` when chain context is present |

5. A read model, `GET /api/tasks/parents`, with query params `company`, `project`,
   `department`, `state`, `source` and a cursor.
   - It returns top-level tasks (no `parentTaskId`), each with its subtasks summary: step,
     department, state, runRef.
   - The parent state is derived:

     | Condition | Parent state |
     |---|---|
     | any subtask error | error |
     | any awaiting approval | blocked |
     | any running | working |
     | all done and chain ended | done |
     | queued | thinking |

   - `GET /api/tasks/:id` includes the `subtasks[]`.
   - `GET /api/departments/:id/subtasks` is a filtered list.
6. Tests:
   - schema round-trip with and without the new fields;
   - legacy tasks still parse;
   - read-model state derivation, table-driven.

**Commit:** `feat(tasks): parent/subtask model, source + department stamps`

---

## ZB-04b — Tasks UI (wave 4)

**Mocks:** `Work Screens.dc.html` → tasks, task detail, new task.

- **`/work/tasks`**
  - A `FilterBar` for company → project (cascading), department, state and source.
  - A `DataTable` of parents, where each row has an id (`TSK-NNNN` display from the task
    id), title, a compact `ChainRouteStrip`, state, source and age.
  - Row click → detail.
  - It replaces `/archiv` as the task-centric list. Run-centric browsing goes to
    `/activity/runs`.
- **`/work/tasks/[id]`**
  - A full `ChainRouteStrip` with corners. Clicking a step selects that subtask.
  - The selected subtask panel shows its department, pipeline `PipelineStepStrip`, agents
    (of that department) and produced artifacts.
  - A runs `DataTable` with stop/resume, and pending approvals as `ApprovalCard` rows.
  - The attachment list.
  - It re-uses the RunDetail logic, moved from `features/runs`.
- **`/work/tasks/new`**
  - Fields: title, brief, project, **entry** (COO = auto-classify, or an explicit
    department, which is a hard override per DNA), **chain** (none / pick / project default,
    O-23), attachments and paths (the existing HighlightTextAreaField and upload).
  - A route preview panel with corners: a COO glyph, a sentence, and a compact
    ChainRouteStrip resolved from the chain's rules, with gates.
  - Submit → the existing create mutation with `target` = chain | department | none.
  - `NewTaskProvider` and the CommandLine now open this page. It is a page, not a dialog,
    because it is not a trivial create; the dialog grammar allows either. Keep the
    CommandLine quick path for the dock.
- The department `subtasks` tab is wired (ZB-03).

---

## ZB-05a — Chains backend on HandoffService (D-005) (parallel with ZB-03)

**Paths:**
- `libs/contracts/src/handoff/**`
- `apps/api/src/handoff/**`
- `apps/api/src/tasks/task-scheduler.service.ts` (the chain target)
- `apps/api/src/pipelines/pipeline-runner.service.ts` (`recordArtifact` emitter)
- the terminal-status path for agent-kind runs. Locate it in recon:

  ```bash
  git grep -n "status.*\"done\"\|markDone\|onExit" apps/api/src/tasks apps/api/src/agents
  ```

**Deliverables**

1. **Contracts:**
   - `HandoffSignalKindSchema` gets `chain?: true` and `entry?: DepartmentId`.
   - `HandoffSignalSchema` gets
     `chain?: {chainId, parentTaskId, step: number, artifactRef?: string}`.
   - A new `ChainSchema` **view** type:
     `{id, label, description, entry, steps: {department, gate: "auto"|"ask", ruleId}[], enabled}`
     with `ChainInputSchema`.
   - Router additions in `handoff.contract.ts`:

     | Method | Path |
     |---|---|
     | GET | `/api/handoff/chains` |
     | GET | `/api/handoff/chains/:id` |
     | PUT | `/api/handoff/chains/:id` (create or replace) |
     | DELETE | `/api/handoff/chains/:id` |

2. **`ChainView`** is a pure helper file in `apps/api/src/handoff/chain-view.ts`, not a
   service:
   - `deriveChain(kind, rules)` walks from `entry` along enabled rules
     `{signalKind: id, from}`.
   - `validateChainInput(input)` checks the chain is linear, acyclic, has 1–11 steps, and
     consists only of department targets.
   - `chainToRules(input)` maps gates: auto → tier 2, ask → tier 3 (O-05).
3. **Handoff controller and stores:**
   - `PUT` writes the kind and replaces **exactly** that kind's rules in one locked
     rule-store write. If the kind write fails, the rules are rolled back.
   - `DELETE` removes the kind and its rules, and refuses if a non-terminal parent task
     references the chain (409).
   - The generic rules list endpoint gains `?includeChains=false` as its default, so the
     generic editor never shows chain rules.
4. **`HandoffService.dispatchTask`** passes `parentTaskId`, `chain` (next step), `source`
   and the artifact ref into `createTask` (as pipeline `input` when the target resolves to
   a pipeline). The fingerprint for chain signals is `${parentTaskId}:${step}`.
5. **Scheduler:** a `target.kind === "chain"` task is persisted as the parent without a run.
   - It resolves the chain; a missing or disabled chain → error outcome, surfaced to the
     operator.
   - It dispatches step 0 to `entry` as a department target with
     `parentTaskId` and `chain: {id, step: 0}`.
   - The gate before step 0 is none: the operator created the task.
6. **Completion emitter:** a private `emitChainStep(task, run, artifactRef?)`, called from
   `recordArtifact` (after the existing scout emission, same fail-soft try/catch) and from
   the agent-run terminal `done` path.
   - When the task has `chain`, it calls `handoff.evaluate({from: task.department, kind:
     chain.id, …, chain: {…, step: step+1}})`.
   - If `evaluate` returns no match, it marks the chain ended on the parent (a
     `chainEndedAt` field, additive).
   - An error or interrupted subtask **does not** emit; the parent derives error.
   - **An emission failure never fails the delivery** (the same contract as the scout
     emitter).
7. **Tier-3 hop:** the existing `handoff-proposal` approval. Approve → `resume` dispatches
   the next step with the context intact. This proposal must carry the `chain` context on
   `proposal.signal` (it already stores the whole signal).
8. **Tests:**
   - Table-driven tests for `chain-view`.
   - Controller atomicity, including the rollback.
   - An e2e: create chain `rnd → dev → rel` (auto, ask). With a fake claude runner, a
     parent task → rnd done → dev dispatched with parent linkage → dev done → a
     handoff-proposal approval exists → approve → rel dispatched → rel done → parent done.
   - Idempotency: a duplicate completion event → no double dispatch.
   - A red dev subtask → the chain halts and the parent is `error`.
   - `health.e2e` is green (DI unchanged: `ModuleRef` plus lazy import, as `recordArtifact`
     does today).
9. **Seed:** no system chains are seeded. The operator authors chains. The design's 9
   example chains (`zc-data.js` `ZC.chains`) are written into
   `docs/plans/zibbycorp/example-chains.md` as suggestions only.

**Invariants:**
- Law 1: an ASK hop is an approval and never auto-advances.
- Nothing from the deleted `chain-runner.service.ts` is reintroduced (D-001).

**Commit:** `feat(handoff): chains as ordered handoff routes with parent tasks`

---

## ZB-05b — Chains UI (wave 5)

**Mock:** `Work Screens.dc.html` → chains library and editor.

- **`/work/chains`:** a `DataTable` with columns name, route (a chip-size
  `ChainRouteStrip`), enabled, and in-flight count. Row click goes to the detail.
- **`/work/chains/[id]`:** a read view with edit at top-right, which toggles edit mode on the
  same page.
  - Steps are editable cards (department SelectField, ← → reorder, ✕ remove, `+ ADD
    DEPARTMENT`).
  - A `GateToggle` between steps.
  - Label and description fields.
  - Delete via `ConfirmDeleteButton`, which surfaces the 409 message.
- **`/work/chains/new`:** create is a page, prefilled with an empty two-step chain.
- **Project default chain:** add `Project.defaultChainId?` (O-17) and a picker on the
  project overview tab.

---

## ZB-06 — Goals, Companies, Teams, Projects (wave 4)

**Mock:** `Work Screens.dc.html` → goals, companies, projects. Teams follows the same
pattern as Companies (D-003).

- **Goals:**
  - `/work/goals` is a grid of `GoalCard`s. `GoalCard` is a DS composite: header,
    maker⇄verifier chips, budget meter, iteration summary and actions (resume/stop),
    built from the existing hooks.
  - `/work/goals/[id]` is the detail with iterations, linking to folded maker/verifier logs.
  - Contract: `Goal.projectId?` (O-16).
- **Companies / Teams:** move to `/work/{companies,teams}`, re-skinned.
  - `MetricStrip`, the linked-projects `DataTable`, contacts (a `ContactRow` DS component)
    and budget fields.
  - Delete uses `ConfirmDeleteButton`. Add the "ALL TASKS FOR THIS COMPANY →" link
    (`/work/tasks?company=`).
- **Projects:** move to `/work/projects`, re-skinned.
  - **Keep all 5 tabs** (O-14) as a `SubNav` under the project header.
  - The roadmap tab is unchanged in logic and gains the "Level mapping" panel from
    settings.
  - Integrations stay here (D-011); `/work/projects/[id]/integrations/[integrationId]`
    moves.

---

## ZB-07 — Activity (wave 4)

**Mock:** `Activity Screens.dc.html`.

| Route | Content |
|---|---|
| `/activity/log` | `LogStream` over the activity SSE (O-11). `FilterBar` for department (from the run `department` stamp), agent, task and kind, plus pause/clear. Activity-kind visibility still follows the settings (`/system/settings/activity`). |
| `/activity/runs` | The ex-`/archiv` search, state `SegmentedControl` and infinite scroll as a `DataTable`. `/activity/runs/[runId]` is the run detail (moved) with stop/resume, log, stage timeline and artifacts. |
| `/activity/inbox` | Channel items (existing inbox data): source, sender, tier, handling, and the triage outcome. The text stays truncated per Law 4. |
| `/activity/briefings` | The briefing document (corners Panel, sections) + read-aloud (existing `useSpeech`) + the "generate now" trigger. |

**Retires:** `ChatLiveLog` and the StatusPill / StatusFlyout. Delete them in ZB-13.

---

## ZB-08 — Policy (wave 5)

**Mock:** `Policy Screens.dc.html` and the shell's approval sheet.

- **`/policy/approvals`:** queue and history `DataTable`s (the `ApprovalCard` `row`
  density).
  - `?approval=<id>` opens a `Sheet` with:
    - the request;
    - the rule that fired;
    - a `DiffView` (the PR diffstat or the draft payload);
    - the task chain (`ChainRouteStrip` of the parent, if any);
    - a `MetricStrip`;
    - a footer with approve (HoldButton if high-risk), deny (with an optional reason,
      O-12) and open-task.
  - The rail's "→" opens the sheet over any page, because the sheet lives in the shell and
    reads the search param.
- **`/policy/gates`** has sections, via the `?section=` SubNav:
  - **Floor:** the locked `SystemFloorPanel`, read-only, re-skinned.
  - **Global rules:** `GateRulesSection` / `RuleCard`, re-skinned.
  - **Per project:** a SegmentedControl project picker, then the project rules.
  - **Per agent:** a list of agents with rule counts linking to the profile Rules panel.
  - **Handoff:** the existing mad-libs rule editor, re-skinned, with a department filter
    (`?department=`). **Chain rules are excluded** (D-005 cost).
  - **Signals:** the ex-`/signals` CRUD, moved.
  - **Mandate:** the ex-settings `MandateSection`, moved.
- **`/policy/patterns`:** review-learning rules as `PatternCard`s. `PatternCard` is a DS
  composite with a `CellStrip` of evidence and accept/dismiss actions using the existing
  mutations.

**Invariant I-1:** the floor stays read-only, and HIGH_RISK hold stays in place.

---

## ZB-09 — Knowledge (wave 5)

**Mock:** `Knowledge Screens.dc.html`.

- **`/knowledge/vault`:**
  - A left `List` grouped by tier → department shelf (O-24), with search.
  - The reader is DS `Markdown` with wikilink navigation (reuse `NoteView`'s wikilink
    handling), note nav chips and a "used by" panel.
  - Edit is top-right, using `MarkdownEditor`.
  - `?note=<path>` selects a note.
- **`/knowledge/distill`:** runs of memory-distill and gap-detect, which are
  **department-owned by KNW**.
  - Recon first: find where automation run results persist. If the structured metrics
    (notes read, links added, gaps) do not exist, show the run log and outcome only.
    Do **not** invent fields.
  - The "Run now" trigger calls the existing automation trigger.
  - A **Self-model** section holds the ex-settings `SelfKnowledgeSection` (drift report).

---

## ZB-10 — Ledger (wave 6)

**Mock:** `Ledger Screens.dc.html`.

- **`/ledger/budgets`:** `BudgetMeter`s for global, per company and per project, using the
  existing budget queries and edit forms (edit is top-right, via the budget fields).
  - The department table shows runs today and spend today from the run `department`
    stamp. The caps column is "—" (O-06).
- **`/ledger/spend`:** 5H and WEEK `BudgetMeter`s (limits) with warn and stop ticks.
  - `Slider`s edit `pauseAtRollingPct` / `pauseAtWeeklyPct` and the new optional
    `warnAt*` (O-08, contract-first; crossing one emits an activity notice in the budget
    guard).
  - Spend by department is a `DataTable` with bars.
  - **No SDK credit** (O-07).

---

## ZB-11 — System: settings + registries (wave 6)

**Mock:** `System Screens.dc.html`.

- **`/system/settings/[section]`:** the sections per ROUTE-MAP § 3:
  - general, appearance, coo, activity, automations, runtime, machine, status.
  - `SubNav` on the left at ≥1024px, top below that. Each section is the existing Section
    component, moved and re-skinned.
  - `features/settings/Screen.tsx` becomes the section router.
  - `appearance` holds theme (SegmentedControl light/dark/system, wired to the DS provider)
    and reduced motion (a localStorage per-viewer convenience; DS reads a
    `data-motion="reduced"` attr).
- **`/system/registries/[kind]`:** a `DataTable` per kind (skills, mcp, hooks, commands).
  - A "Bound in" column of department `Tag`s is **derived** (O-09).
  - Add `GET /api/departments/:id/bindings` or compute it client-side from agents and
    pipelines; prefer server-side, contract-first.
  - Detail and new pages move from `/skills/[id]` etc. with unchanged forms.

---

## ZB-12 — ⌘K palette, COO dock, voice (wave 7)

- **CommandPalette:** it is backed by the ex-`ChatSearch` index, **broadened** to
  departments, people, tasks, chains, goals, companies, teams, projects, pipelines,
  registries (4 kinds), vault notes, settings sections, gate sections and actions
  ("New task", "Approve next", "Toggle theme").
  - This fixes the pre-existing gap (automations, hooks and signals were missing).
  - ⌘K opens it globally, bound in the AppShell.
- **COO dock:** the DS `ChatDock` is wired to the existing chat engine (the claude CLI
  `--resume` stream; `features/chat` hooks), which is now **shell-global**.
  - Target chip: default COO (the classifier). The department page sets an **explicit
    department target** when opened from it (O-20).
  - The composer supports attachments and @-mentions (the existing CommandLine logic
    moved into dock hooks).
  - The VOICE button uses the existing `useSpeechRecognition` / `useSpeech` with the echo
    guard and idle gating (O-22).
  - "CREATE TASK" from a chat reply → `/work/tasks/new` prefilled.
- **Retires:** the `/chat` page, which already redirects since ZB-02.

---

## ZB-13 — Cleanup (wave 8)

**Delete:**
- `libs/design-system/src/immersive/**`;
- the deprecated `LivingGlow`, `OrbitLoader`, `ProgressRing` if unused, and `GlassSurface`;
- `apps/web/components/{HudCard,HudPanel,layout/ImmersivePage}`;
- `apps/web/features/chat/components/{ChatScreen,ChatTopBar,ChatToolDock,DepartmentOrbMap,StatusPill,StatusFlyoutPanel,ChatLiveLog,ChatTasksPanel,ChatSearch}`,
  keeping hooks and the engine used by the dock;
- `features/archive` (moved);
- the `(dashboard)` group, if any stragglers remain.

**Then:**
- `pnpm exec knip`: remove the dead exports it reports. After deletions, run the
  typecheck: grep's own-path filter can mask foreign deep imports (NC2 lesson).
- Remove the i18n keys that no source references. Write a script for this; do not do it by
  hand.
- Re-check `pnpm check:deps` (the madge cycle guard).
- Run `graphify update .`, then regenerate self-knowledge.

**Kept:** the redirects (one version).

---

## ZB-14 — Part B validation → park (wave 9)

- The full check list from ZC-06, plus `pnpm check:names`, plus the className grep.
- A live browser run over **every** route in ROUTE-MAP § 1 and every redirect in § 2, in
  light and dark, at 1440 and 390 px.
  - Screenshots go to `.playwright-mcp/zc/`.
  - A design-match summary table goes into PROGRESS.
- End-to-end smoke flows (the IA doc's Flow A and Flow B):
  - **Flow A:** New task with chain → subtasks progress → ASK gate in the rail → approve
    in the sheet → chain completes → the task shows done.
  - **Flow B:** an approval arrives → the rail → the sheet → deny with a reason → the
    activity log records it.
- The final butler's briefing in PROGRESS (ROADMAP § DoD).
