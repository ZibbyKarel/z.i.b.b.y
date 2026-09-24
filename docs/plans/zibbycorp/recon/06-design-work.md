# Design audit — Work Screens.dc.html (ZibbyCorp mockup) vs current z.i.b.b.y code

Scope per assignment: `design/ZibbyCorp/Work Screens.dc.html` (Tasks, Task detail,
New task, Chains library+editor, Goals, Companies, Projects) + the task/chain/goal/
company/project slices of `design/ZibbyCorp/zc-data.js`. Cross-referenced against
`Information Architecture.dc.html` (product spec), `ZibbyCorp Design System.md`
(tokens/components), and the real code: `libs/contracts/src`, `apps/api/src`,
`apps/web/features`. Prior research consumed: `02-web-routes.md`,
`03-backend-domain.md` (both already cover the full current web/backend surface in
depth — this file does not repeat their content, only what's new for this scope).

No repo files were modified. Screens rendered by reading source only (no live
Playwright render was needed — the `.dc.html` + `data-dc-script` `renderVals()` was
read directly and is fully deterministic/traceable from the mock data).

---

## 0. Orienting facts that shape everything below

- **ZibbyCorp is a *rename + reframe* of the existing 11-subsystem federation**,
  not a new backend: `Information Architecture.dc.html` §05 "Migration" table maps
  every current nav segment 1:1 onto a ZibbyCorp location (`overview→ORG/Org map`,
  `chains→WORK/Chains`, `gates→POLICY/Gate rules`, etc). UI shows corporate names
  only (Development, Monitoring & Ops, …); the 11 mythic ids (forge, puls, …) stay
  in code as-is — **no rename of `SubsystemIdSchema` members is implied**, only a
  presentation-layer label swap (`code` DEV/OPS/SEC/REL/INC/RND/COM/QA/KNW/FIN/PER
  vs today's forge/puls/sentinel/maestro/beacon/scout/herald/loom/codex/ledger/hearth).
- **The one genuinely new domain concept is Chain**, reintroducing — in a different
  shape — the `chains`/`ChainRun` feature that was **fully amputated**
  (`docs/plans/handoff-implementation-plan.md` Part B, branch `feat/subsystem-handoff`)
  and replaced by the reactive `HandoffService` rule engine. See §3 for the detailed
  relationship; short version: **old Chains ≠ new Chain**. Old chains were an
  operator-run, step-by-step artifact-passing runner (`chain-runner.service.ts`,
  349 lines, since deleted) glued into the unified run feed/SSE/entity-MCP/subsystem
  status. The design's Chain is a **declarative, named, reusable route definition**
  (like a pipeline, but across departments) that a **parent Task** walks, spawning
  one **Subtask** (= today's dispatched run, scoped to one department's pipeline) per
  step, gated by the *existing* Handoff/gate-rule machinery at each step boundary.
  Today's code has **no orchestration layer that walks a multi-step route and starts
  step N+1 when step N finishes** — only a low-level plumbing primitive survives
  from the old chains work (see §3.1).
- **Task = parent, Subtask = one department's pipeline run** is the whole task
  model shift. Today `ScheduledTask` dispatches to exactly **one** `TaskTarget`
  (agent | pipeline | goal | subsystem-resolved-away | orchestrator) and that's the
  entire task — there is no parent/child task relationship anywhere in the schema.
- **Companies and Projects screens in this mock are near-identical in shape to
  today's `/companies` and `/projects` pages** (see §4) — this is the closest part
  of the scope to a re-skin. Tasks/Task-detail/New-task/Chains/Goals are where the
  real backend gap lives.

---

## 1. Screen-by-screen inventory

Route key format below is the mock's own hash-router value (`this.props.route`,
parsed as `work/<segment>[/<id>]`), matching the IA's proposed `WORK` section.
Token/label sourcing: `ZibbyCorp Design System.md` (see that file for the full
token sheet — not re-quoted per field below except where a concrete value matters).

### 1.1 Tasks — `work/tasks`

**Regions, top → bottom:**
1. Header row: mono label `WORK — TASKS`, `display` h1 "Parent tasks", right-aligned
   mono count `{{ taskCount }}` (format `NN OF NN`, e.g. `08 OF 11`).
2. Filter bar (`display:flex;gap:18px;align-items:flex-end`), 5 controls + a
   conditional 6th:
   - **COMPANY** `<select>` — options: `All companies`, one per `ZC.companies`
     (by name), `No company · internal`. Height 32, `border-2` (`--line2`).
   - **PROJECT** `<select>` — options depend on the COMPANY filter: `All projects`,
     then the projects in-scope for the selected company (label = `id` [+ ` · `
     + company name when COMPANY=all and the project has one]), plus `No project`
     when COMPANY is `all`/`none`.
   - **DEPARTMENT** `<select>` — `All departments` + one per `ZC.depts` (label
     `CODE · Name`, e.g. `DEV · Development`).
   - **STATE** — segmented control (not a select): `ALL / WORKING / BLOCKED /
     ERROR / DONE / IDLE` (label = `QUEUED` for `idle`'s displayed word — see
     `stU()`: `idle→'QUEUED'`, others → `B.S[s].label.toUpperCase()`). Selected
     segment: bg `--ink`, text `--panel`; others `--ink3`. Each non-"ALL" segment
     shows a 7px status dot before the label.
   - **SOURCE** — segmented control: `ALL / COO / DIRECT / INBOUND / AUTOMATION`
     (see `srcCat()` — regex-classified from the task's free-text `source` field:
     `COO*` → COO; `Slack|GitHub|Jira|mail|Inbox|advisory` → INBOUND; `Automation`
     → AUTOMATION; else DIRECT).
   - **CLEAR FILTERS** button — only rendered when `hasFilters` is true (any of
     the 5 filters ≠ its "all" default). Resets all five to `all`.
3. Table, bordered panel (`--panel` bg, `--line` border):
   - Header row (grid `86px 2.2fr 1.4fr 110px 110px 64px 50px`, mono 10 `--ink3`
     uppercase): `ID · TASK · CHAIN PROGRESS · STATE · SOURCE · COST · UPD`.
   - One button-row per task (full row is clickable → `work/task/<id>`), hover
     bg `--panel2`:
     - `ID` — mono 11, e.g. `TSK-0142`.
     - `TASK` — two-line stack: title (sans 14, truncated) + mono 10 meta line
       = `PROJECT · COMPANY · CHAIN` all-caps, `·`-joined, omitting company when
       none (e.g. `CLIENT-PORTAL · NORTHWIND TRADERS · FEATURE`).
     - `CHAIN PROGRESS` — a **route strip**: one chip per subtask
       (`border:1px solid <line-color>` where line is `--ink` if that subtask is
       blocked/error, else `--line2`; 6px status dot + 3-letter dept code), chips
       joined by a mono `→` in `--ink3`. This is the row-level compressed view of
       the same route the Task-detail screen renders full-size.
     - `STATE` — dot + uppercase label (task-level rollup state, see `taskState()`
       below).
     - `SOURCE` — uppercase free text (`COO CHAT`, `SLACK #ALERTS`, `GITHUB
       ADVISORY`, `AUTOMATION`, `GITHUB #77`, `JIRA API-212`, …) — **not** a closed
       enum in the mock, just the raw source string.
     - `COST` — right-aligned `$X.XX`, tabular-nums.
     - `UPD` — right-aligned relative time (`2M`, `1H`, `4M`…), pre-formatted
       string, no live recompute.
   - Empty state: `No tasks match these filters.` (13px, `--ink2`), shown only
     when the filtered list is empty (filters, not "no tasks at all" — there's no
     distinct zero-data empty state authored).

**Task-level rollup state** (`ZC.taskState`, not stored — computed): scans all
subtask states, returns the first match in priority order `error > blocked >
working > thinking`; if none of those and every subtask is `done` → `done`; else
`idle`. This priority ladder (error beats blocked beats working beats thinking)
is a concrete, reusable piece of logic a real implementation needs to replicate.

**Data fields consumed per task** (from `zc-data.js` `T()` builder): `id, title,
chain, project, source, picked, cost, updated, output, subs[]`. Each `subs[]` entry:
`{ id, dept, pipeline, state, step, produces }` — see §2.

### 1.2 Task detail — `work/task/<id>`

**Regions, top → bottom:**
1. Header: mono meta line `{{ tk.id }} · CHAIN · {{ chainName }} · {{ pickedU }}`
   where `pickedU` ∈ `AUTO-PICKED BY COO / FIXED BY SOURCE / OVERRIDDEN BY YOU`
   (from `task.picked` ∈ `auto|fixed|override`) — h1 title, sans 14 `--ink2` meta
   line (`From <source> · <project> · $X.XX so far · updated <time, lowercased>`),
   then on the right: a state badge (`1px --line2` box, dot + uppercase state) and
   a `LIVE LOG →` button (→ `activity/log/<taskId>`, out of this scope's screens).
2. **Chain route strip** — a bordered `--panel` card with corner brackets
   (the design system's signature "focus object" framing), containing a
   horizontal flex of subtask cards, one per `tk.subs[i]`:
   - Each card: mono 10 header `SUB {{n}} · {{deptCode}}` + state dot/label on the
     right; sans 14 dept name; sans 12 `--ink2` = `Pipeline {{pipeline}} ·
     {{step, lowercased or 'complete'/'queued'}}`; bottom-pinned mono 10 line =
     `CONSUMES · <prev.produces>` / `FROM · COO` (if first) `— PRODUCES ·
     <this.produces>` (if set).
   - Between adjacent cards (when there's a next one): a 58px **gate** column:
     `→` / `GATE` / the resolved mode (`AUTO`/`ASK`), computed by
     `gateMode(fromDept, toDept, chain, i)` — **reuses the mock's
     `ZC.handoffRules` table** (`{from, to, mode}`) first, falling back to the
     chain's own per-step `gates[i]` array, defaulting to `AUTO`. This is the
     mock's explicit statement that a chain's gate resolution is meant to defer
     to the (real) handoff-rule catalog, not carry its own independent mode.
   - Selecting a subtask card (click) sets `sel[taskId] = index`; default
     selection is the first non-`done` subtask (or the last, if all done).
3. **Two-column detail row** (`1.6fr / 1fr`):
   - **Left — selected Subtask panel** (`--ink`-bordered, focus panel):
     - Header: `SUBTASK <id>`, dept name (h3-ish, 18px), right-aligned
       `DEPARTMENT →` button (→ `org/dept/<deptId>/pipelines` — out of scope,
       confirms Task detail cross-links into the (out-of-scope) Department
       screen's Pipelines tab).
     - Mono meta: `PIPELINE · <pipelineName> · WORKTREE wt/<subtaskId>` — the
       mock's stated worktree-naming convention: **one worktree per subtask**,
       named by the subtask id (`TSK-0142.2` style — task-id-dot-index).
     - **Pipeline step strip**: one chip per phase in the resolved pipeline
       definition (`ZC.pipelines[dept]`), state-colored relative to the current
       step index (`done` for indices before current, live state for the
       current index, `idle` after), arrows between chips are `⇄` when the pair
       `(i, i+1)` is a listed loop-back edge in the pipeline's 3rd tuple element
       (`pipe[2]`), else `→`. This is a literal small-scale rendering of
       `PipelinePhase.loop` back-edges.
     - **Borrowed agents** grid (`auto-fill, minmax(200px,1fr)`): one card per
       agent from `ZC.subAgents(subtask)` (agents whose `.task` matches the
       *parent task id* and `.dept` matches this subtask's dept, and the subtask
       isn't idle) — glyph (30px, glowing/live), name+role (mono 11, e.g. `STUART
       · CODER`), current activity (sans 12, truncated, e.g. "Addressing review
       comments on PR #318"). Card click → `org/agent/<id>` (out of scope).
       Empty-state text differs by whether the subtask is done ("Agents returned
       to the pool when this subtask finished.") or not yet started ("Agents are
       borrowed when this subtask starts.") — this is the **pool borrow/return
       semantics IA §01 describes**, made concrete: an agent's presence here is
       entirely derived (no `borrowedBy: taskId` field — it's inferred from the
       agent's own `.task`/`.dept` pointers).
   - **Right column**, stacked cards:
     - **ARTIFACTS** panel — list of `{name, meta}` for every subtask that has a
       `produces` value (`meta` = `<deptCode> · <subtaskId>`); empty state "No
       artifacts yet."
     - **OUTPUT** panel — single line: `tk.output` if set, else (if task is
       `done`) the last subtask's `produces`, else "Pending · the last department
       produces the output." This is the task-level terminal deliverable (a PR
       url or file name in the real data).
     - **RUNS** panel, header `RUNS · <count>` — every `ZC.runs[]` entry whose
       `sub` starts with the task id (i.e. `TSK-0142.1`, `TSK-0142.2`, …): id,
       dot+truncated-last-event-line, right-aligned cost. This is a **flat run
       list across every subtask of the task**, one row per run (not one row per
       subtask — a subtask can have multiple runs, e.g. rework-loop retries).

**Data fields** — task: `id, title, chain, picked, source, project, cost, updated,
output, subs[]`. Subtask: `id, dept, pipeline, state, step, produces`. Run (from
`ZC.runs`): `id, agent, sub (subtask id), state, dur, retries, cost, events[]`.

### 1.3 New task — `work/new[/<entryDeptId>]`

**Two-column layout (`1.3fr / 1fr`):**
- **Left — form:**
  - `WORK — NEW TASK` label, h1 "Hand work to the company".
  - `TITLE` — single-line input, placeholder "e.g. Add SSO to the client portal".
  - `BRIEF` — 5-row textarea, placeholder "Context, links, what done looks like".
  - Two-column row: `ENTRY` select (`COO decides` + `Directly into <dept
    name>` per department — i.e. **entry point is either the COO/classifier or a
    named department**, matching IA's "Tasks enter three ways" ENTRY card) and
    `PROJECT` select (`No project` + every project, labelled `id [· company]`).
  - `CHAIN` — a row of toggle-chip buttons: `AUTO · COO` + one per chain (name
    uppercased). Selected chip: filled `--ink`/`--panel`; others outlined
    `--line2`/`--ink2`.
  - Actions: `CANCEL` (secondary, flex 1) / `CREATE TASK` (primary, flex 2).
- **Right — Route preview card** (bordered `--panel`, corner brackets on two
  opposing corners only — a lighter-weight framing than the Task-detail strip):
  - `ROUTE PREVIEW` label.
  - COO glyph + a suggestion sentence: `nt.chain === 'auto'` → either "Type a
    title and Zibby will propose a chain." (no text yet) or "Zibby proposes
    <chain name>. You can override it below." (once `ZC.classify()` — a
    **client-side keyword-regex classifier stub**, see §2 — has matched); if the
    operator picked a chain explicitly → "You picked <chain>. Zibby would have
    picked <auto-guess>." — i.e. **the preview always shows what the COO would
    have chosen even when overridden**, a direct implementation of IA Flow A
    step 02 ("You can override it until the task starts").
  - Route list: one card per resolved department step (`SUB <n> · <code>` +
    pipeline name + dept name), with an inline `↓ GATE · <mode>` line between
    steps (same `gateMode()` resolution as Task detail).
  - Footer note (12px `--ink2`): "The chain is fixed once the task starts. Until
    then you can override the COO's pick." — **this is the literal, load-bearing
    sentence for the "chain can't change once started" business rule** the
    assignment calls out; it is a UI copy string today, backed by nothing (the
    mock's `createTask()` just snapshots the resolved route into `subs[]` once,
    with no code path that ever mutates a task's route after creation — so the
    *invariant* already holds in the mock purely because nothing writes to it,
    not because anything enforces it).
  - **Route resolution logic** (`out.isNew` block): starts from the auto-guessed
    or explicitly-picked chain's `route[]`; if an explicit ENTRY department was
    chosen that isn't already the route's first element, it's **prepended** —
    so "enter directly into department X" always makes X step 1, even if X's
    own presence elsewhere in the chosen chain is otherwise unaffected (no
    dedup logic beyond the prepend-if-absent check).
  - **Submit** (`Z.createTask`): builds a task id (client-side incrementing
    counter, `TSK-0151` style), resolves the final route once more (prepending
    the entry dept if needed), and materializes one `subs[]` entry per route
    step — `state: 'thinking'` for index 0 (immediately active), `'idle'` for
    the rest, `step` = the first pipeline phase's role name uppercased for index
    0 only. Then redirects to the new Task-detail screen. **No approval/gate
    step is modeled at creation time in the mock** — the task starts immediately
    (autonomy-tier framing for task *creation itself* is out of this mock's
    scope; gating only shows up at inter-department handoffs).

### 1.4 Chains — library + editor — `work/chains`

**Two-column layout (`320px / 1fr`):**
- **Left — Chain library** list:
  - Header `CHAIN LIBRARY · <count>` + `+ NEW` button (creates
    `{id:'chainN', name:'New chain', route:[], gates:[], desc:''}`, selects it).
  - One row per chain: name (sans 14) + right-aligned mono `<n> TASKS` (count of
    tasks currently on that chain, live-computed) on the header line; second line
    = mono 10 `--ink2` route string, dept codes joined by ` → ` (e.g. `RND → DEV
    → REL`), or `—` if the route is empty. Selected row: `--ink` border,
    `--panel2` bg.
- **Right — Chain editor** (`--ink`-bordered panel, i.e. always the visual focus):
  - Header: `CHAIN EDITOR` label + an **inline-editable name** (bare `<input>`,
    no visible border, 18px/500 — "click into the title to rename") + right
    status text: `SAVED` (after save) / `UNSAVED` (dirty draft) / `<n> STEPS`
    (clean, no draft).
  - Description input (single line, placeholder "What this chain is for").
  - **Step editor row** — one 170px card per route department:
    - Header: `STEP <n> · <code>` + `✕` remove button.
    - Dept name (min-height 36px so single/double-line names align).
    - Pipeline list for that department (mono 10, `·`-joined — e.g. `DELIVERY ·
      QUICKFIX`, i.e. shows **every** pipeline option that department owns, not
      just the one that'll run — the actual pipeline picked per-task is presumably
      resolved elsewhere, likely always `pipelines[dept][0]` per `out.isNew`'s
      `Z.pipelines[d][0][0]` usage; the mock never lets the chain editor pick a
      *specific* pipeline per step, only the department).
    - `←` / `→` reorder buttons (swap with adjacent step; no drag-and-drop).
    - Between steps (when not the last): a 74px gate column — `→ GATE` label +
      a clickable mode toggle (`AUTO`⇄`ASK`, `--ink`-bordered when the value is
      shown, i.e. always rendered as if "selected" — this control **writes
      directly to the chain's own `gates[]` array**, distinct from the read-only
      handoff-rule-catalog resolution shown on Task detail/New task. This is an
      **inconsistency worth flagging**: Chains editor treats gate mode as an
      attribute of the chain step itself (`ed.gates[i]`); Task detail/New task
      resolve gate mode primarily from `ZC.handoffRules` (department-pair rules)
      and only fall back to the chain's own `gates[]` when no handoff rule
      matches. A real implementation has to pick ONE source of truth for "does
      this handoff ask or run automatically" — see §3.)
    - A dashed-border "ADD DEPARTMENT" cell at the end — a `<select>` of every
      department not already in the route; picking one appends it (`gates`
      grows by one `'ask'` entry, unless the route was previously empty).
  - Footer note: "Departments never pick the next department. Click a gate to
    switch between AUTO and ASK; gate rules in Policy can still force ASK." —
    i.e. **explicit statement that Policy-level gate rules can override a
    chain's own AUTO setting but presumably not force AUTO when the chain says
    ASK** (strictest-wins, matching the real `GateRule` "three buckets, strictest
    wins" model already in the codebase for agent/subsystem/system rules).
  - Actions: `DISCARD` (drops the draft) / `SAVE CHAIN` (mutates the chain object
    in place — `Object.assign`, lowercases the gates array back to `auto`/`ask`
    for storage — and shows `SAVED` until the next edit).
  - **No delete-chain action** is modeled (only add/discard/save) — worth
    flagging as a probable oversight or deliberate "chains are load-bearing,
    don't delete" stance, given chains are referenced by id from tasks/projects.

### 1.5 Goals — `work/goals`

**Single-column header + card grid (`auto-fill, minmax(400px,1fr)`):**
- Header: `WORK — GOALS` label, h1 "Maker ⇄ verifier loops", inline explainer
  sentence "A goal repeats until the verifier passes or the run budget runs out."
- One card per goal:
  - Header row: mono `<id> · <PROJECT>` left, dot + state label right.
    State label mapping: `parked` (derived — local-only `goalState` override,
    not part of the real state enum) → `PARKED`; `done` → `MET`; else the
    design-system status label uppercased (`WORKING`, `THINKING`, …).
  - Title (sans 16/500).
  - Maker/verifier chip row: `MAKER · <role>` `⇄` `VERIFIER · <role>` (both are
    **role names**, e.g. `CODER`/`TESTER` — not agent ids; the mock's goal data
    uses the same role vocabulary as `ZC.agents[].role`, implying a real Goal's
    `maker`/`verifier` in this UI would be resolved to a *role*, not the actual
    `MakerRef{kind,id}`/`VerifierSpec` shapes the real schema stores — see §2 for
    the mismatch).
  - Run-budget progress bar (2px track, `--ink` fill) + meta row `RUN BUDGET`
    left / `<used> / <max> RUNS` right (zero-padded).
  - Current-iteration summary line (sans 13, `--ink2`) — e.g. "Iteration 6 ·
    verifier failed 1 of 42 tests"; when parked, swaps to the goal's own
    `.parked` reason string if present.
  - A small inline log (up to 3 lines shown in the mock data, mono 11 `--ink2`,
    newest first) — e.g. `I6 · Tester: 41/42, flaky #pay click`.
  - Action row: state-dependent —
    - `done` → `ARCHIVE` (no-op stub in the mock).
    - `parked` (local override) → `RESUME · +10 RUNS` (bumps local state to
      `working`, doesn't actually extend `runs[1]`/max in the mock data — a
      UI-only stub).
    - otherwise → `PARK` (sets local state to `idle`) + `OPEN LOOP →` (→
      `activity/runs`, out of scope).
- **No goal-creation flow is modeled** in this screen (no "+ NEW GOAL" anywhere)
  — matches today's reality where Goal creation has no dedicated UI at all
  (`features/goals` is hooks-only per `02-web-routes.md` §8 item 5).

### 1.6 Companies — catalog + detail — `work/companies[/<id>]`

**Two-column layout (`320px / 1fr`):**
- **Left — Company list:**
  - Header `COMPANIES · <count>` + `+ NEW` (creates a company with default
    budget `{daily:10, weekly:40, monthly:150, cap:200}`, empty team/projects,
    selects it).
  - One card per company: name + right-aligned dot+`<n> OPEN` (dot color =
    hottest open task's state if any is `error`/`blocked`, else `working` if any
    open task exists, else `idle`); description (12px, 2-line clamp via
    `text-wrap:pretty`, not an explicit line-clamp CSS); mono meta line `<n>
    PROJECTS · <n> CONTACTS · $<monthly>/MO`. Selected: `--ink` border,
    `--panel2` bg.
  - Static footer sentence: "A company is a third party you work for. Its
    projects inherit the default budget, and its contacts ground Communications
    when it writes to them." — **directly documents two behaviors that must be
    real**: (a) company budget is a project-level *default*, not a hard
    override — matches today's real `ResolvedProjectService` merge semantics
    closely; (b) company contacts feed Herald/Communications drafting — matches
    today's `ProjectPersonSchema.comms_style`/`vip` fields' documented purpose.
  - Empty state (no companies at all): dashed border box, "No companies yet.
    Create one to group projects under a client."
- **Right — Company detail** (only rendered when a company is selected/exists):
  - Header: `COMPANY` label + inline-editable name input + `DELETE` button with
    a two-click confirm pattern (`confirmDel` state) — first click flips the
    button to `CONFIRM DELETE` (dot appears, border goes `--ink`) and reveals a
    warning line: "Linked projects stay in the system and lose their company.
    Contacts are removed. Click again to confirm." — **explicit deletion
    semantics**: unlinking projects is non-destructive to the project, but the
    contact roster is hard-deleted with the company.
  - Description input (single line).
  - **4-column metric strip** (top+bottom hairline): `PROJECTS` / `OPEN TASKS`
    / `SPEND TO DATE` (`$` sum of `.cost` across every task on any of the
    company's projects — all-time, not scoped to a budget window) / `MONTH CAP`
    (`$<budget.monthly>`).
  - **PROJECTS** sub-panel — header `PROJECTS · <count>`, bordered list:
    - Row per linked project: id+desc stack, mono `repo · branch`, mono gate
      label (`p.gate` uppercased — `RELAXED`/`STANDARD`/`STRICT`, see §2), right
      `<n> OPEN` count, and two icon-style buttons: `CONFIG →` (→ `work/projects`
      with that project pre-selected) and `✕` (unlink — removes from
      `projectIds`, doesn't touch the project itself).
    - Empty row text: "No projects linked. Link an existing repository or add a
      new one below."
    - Footer row: a `<select>` of unlinked projects ("Link existing project…",
      each option showing " · move from <other company>" when the project is
      currently linked elsewhere — **linking is exclusive, at most one company
      per project**, enforced client-side by first stripping the project id from
      every company's `projectIds` before pushing it onto the new one) OR two
      inline inputs (`project-name` id slug input with live
      lowercase/dash-sanitization, `owner/repo`) + `+ ADD PROJECT` button that
      **creates a brand-new project record inline** (id from the slug, repo
      defaulting to `<companyId>/<id>` if left blank, `branch: 'main'`, `chain:
      'feature'`, `gate: 'standard'`, `cap` = the company's rounded daily budget,
      `desc` auto-generated) — i.e. **project creation is reachable from inside
      the company screen**, not only from a dedicated `/projects/new`.
  - **Two-column row**: DEFAULT BUDGET (left) / CONTACTS (right):
    - Budget: 4 numeric `$`-prefixed inputs (`daily`, `weekly`, `monthly`,
      `cap`/"hard cap"/"total"), each with its own unit suffix; edits are staged
      into local `coBudget` state (not written to `Z` until `SAVE BUDGET`,
      discardable via `DISCARD`) — dirty-state save/discard pattern, distinct
      from the header name/desc fields which write immediately on change
      (`mut()` — no draft state for those two).
    - Explainer: "A project without its own cap uses these limits. When both
      exist, the stricter one wins." — again matches the real merge-and-strictest
      semantics conceptually, though the *shape* of budget differs (see §2).
    - Contacts: avatar-initial tile (26px, first letter of name) + name/role-note
      stack + a `KEY` toggle button (title: "Key contact: Communications always
      asks before writing to them" — **this is exactly today's `vip` flag's
      documented behavior**, forces Tier-3) + `✕` remove. Inline add row: Name +
      Role text inputs + `ADD` button.
  - **OPEN TASKS** sub-panel — header `OPEN TASKS · <count>` + `ALL TASKS FOR
    THIS COMPANY →` link (sets the Tasks screen's COMPANY filter to this company
    and every other filter to `all`, navigates to `work/tasks` — this is the
    only cross-screen filter-priming interaction in the whole scope). Row per
    open task (id, title, uppercase project code, dot+state) — same row shape as
    the Tasks table's leftmost columns, condensed to 4 columns. Empty text:
    "Nothing open for this company."

### 1.7 Projects — catalog + config — `work/projects`

**Two-column layout (`1.4fr / 1fr`), no separate detail route — master/detail on
one screen (selectedId pattern, same structural oddity §8 of `02-web-routes.md`
already flags for today's real `/pipelines`):**
- **Left — Project table:**
  - Header `WORK — PROJECTS`, h1 "Repositories".
  - Table columns: `PROJECT` (id + desc stack) / `COMPANY` (name, `--ink3` when
    "Internal") / `REPO` (mono `repo · branch`) / `GATES` (mono, uppercased gate
    profile) / `TASKS` (right-aligned open-task count). Row click selects
    (highlights bg `--panel2`, no navigation — everything happens in the right
    CONFIG panel).
- **Right — CONFIG panel** (`--ink`-bordered, always showing the selected
  project):
  - Header: `CONFIG` label + project id (18px).
  - **COMPANY** — `<select>` (`Internal · no company` + every company) +
    conditional `OPEN →` button (only when a company is set, → `work/companies/
    <id>`); below it a dynamic note: if linked, "Inherits <company> limits:
    $<daily>/day, $<monthly>/month. The stricter of this cap and the company's
    wins."; if internal, "Internal projects draw on the company-wide ZibbyCorp
    budget." — **again documents that an "internal" (no-company) project still
    has an implicit ambient budget ceiling**, a concept with no obvious existing
    counterpart (today's global `Budget`/`GlobalBudgetSchema` is a *subscription
    window* pause threshold, not a per-project-without-a-company dollar cap).
  - **DEFAULT CHAIN** — `<select>` of every chain, by name. Writes `project.chain`
    immediately on change. **This is a brand-new Project field**: today's
    `ProjectSchema` has no notion of a default routing chain — the closest
    concept is nothing at all (chain/route selection today happens per-task, via
    the classifier, with no per-project override).
  - **GATE PROFILE** — 3-way segmented control `RELAXED / STANDARD / STRICT`,
    writes `project.gate` immediately. **Also brand-new**: no such enum exists on
    `ProjectSchema` today; the closest real concept is the project's own
    `GateRule[]` catalog entries (arbitrary match/decision/resolve tuples, no
    single "profile" summarizing them) plus `checks[]` (verify-phase shell
    commands, unrelated).
  - **DAILY RUN CAP** — bare numeric input (no `$`, no unit shown — it's a *run
    count*, matching `dailyRuns` conceptually, but presented as a single number
    with no weekly/monthly/concurrent/cost-cap siblings at all — a much
    flatter/simpler budget model than either the real `ProjectBudgetSchema` OR
    even this mock's own Company budget block).
  - **PROJECT GATE RULES** — header `<count>`, then a flat list (`action` sans
    left / `mode` mono `--ink2` right, e.g. `git.push feature/* — AUTO`) sourced
    from `ZC.projectRules` filtered by `project === p.id` — **read-only in this
    screen** (no add/edit/remove control here; presumably editable elsewhere,
    i.e. Policy → Gate rules per the IA sitemap, which is out of this scope).
  - **TASKS** — flat list of every task on this project (dot + mono id + title,
    click → task detail). No filter/pagination — assumes a project's task list
    stays short enough to render inline (a real implementation would need this
    scoped/paginated once task volume grows — the real `/archiv` screen already
    handles that problem generally).

---

## 2. Data model — `zc-data.js` vs current contracts

Legend: **exists** = a close/equivalent real field exists today; **missing** = no
real counterpart; **mismatch** = a real field exists but the shape/semantics differ
meaningfully.

### 2.1 Task (parent)

| Mock field | Real counterpart | Status |
|---|---|---|
| `id` (`TSK-NNNN`) | `ScheduledTask.id` | exists (format differs — real ids are less structured, no `TSK-` convention enforced) |
| `title` | `ScheduledTask.title` | exists |
| `chain` (chain id) | — | **missing** — no field on `ScheduledTask`; nothing plays this role |
| `project` (project id) | `ScheduledTask.projectId` | exists, semantics close (attribution-only, resolved via `matchProject`, "never authorization") |
| `source` (free text, e.g. "COO chat", "Slack #alerts", "GitHub advisory") | closest: `ScheduledTask` has no `source`/origin field at all; provenance today is scattered — `roadmapItemId`/`roadmapItemLabel` (roadmap-sourced), a channel's `ChannelItem` (inbound), or implicit ("came from the New Task form") | **missing** as a unified field — would need a new `source`/`origin` field on the task entity, or a computed view over existing provenance fields |
| `picked` (`auto`/`fixed`/`override`) | closest: `TaskRoutingSchema`/`ClassificationTraceSchema` capture the classifier's verdict + confidence + alternatives for **routing to a single target**, not "which chain, and was it overridden" | **missing** — new concept, though the classifier's trace-and-override pattern is a reasonable template |
| `cost` (running $ total) | Budget ledger has per-run cost lines (`BudgetLedgerStore`, `costUsd`); no single "task total" rollup field exists, would need summing across the task's subtask runs | **missing as a stored field**, derivable |
| `updated` (relative time string) | `ScheduledTask` has no `updatedAt`; has `createdAt`, `scheduledAt`, and various terminal timestamps (`outcome.finishedAt`) | **missing** as a single field, partially derivable |
| `output` (terminal deliverable string/PR) | `TaskOutcomeSchema.pr` (`PrOutputSchema`: url+additions+deletions) covers the PR case; a generic "the task's overall output" string across a multi-subtask chain doesn't exist | **mismatch/missing** — today's outcome is per-*run*, not per-parent-task |
| `subs[]` (array of Subtask) | — | **missing entirely** — see below, this is the core new relationship |

### 2.2 Subtask (one department leg of a chain)

| Mock field | Real counterpart | Status |
|---|---|---|
| `id` (`<taskId>.<n>`) | — | missing; naming convention only in the mock |
| `dept` (subsystem id) | `Pipeline.ownerSubsystem` / `SubsystemTaskTargetSchema.id` | exists conceptually (a subtask "belongs to" a subsystem the way a pipeline already does) |
| `pipeline` (pipeline name string) | `PipelineRun.pipelineId` | exists — a subtask run **is** conceptually a `PipelineRun` (or `AgentRun`) scoped to one dept, once one exists |
| `state` | `RunStatusSchema` (running/done/error/interrupted/awaiting-approval/paused-limit) + `PipelineRun.status` | exists, close but not 1:1 — mock adds a `thinking` state (no real equivalent — real code has no "thinking" run status, only the *agent* status enum used for live glyphs has richer states than the run-status enum used for persistence) |
| `step` (current pipeline phase, uppercase role name) | `PipelineRun.currentStage` (a `PipelinePhase.id`, not a role/agent name) | exists, shape mismatch (id vs display label) |
| `produces` (artifact filename) | `PipelinePhase.produces` (relative handoff path) + `ArtifactRecordSchema.locator`/`.from` | exists — this maps very cleanly onto the real `ArtifactRecord` primitive (see §3.1) |

**Not modeled at all in the mock but real today and needed:** a subtask's actual
dispatched run id(s) (`runRef` equivalent — the mock infers "runs for this
subtask" only by string-matching `run.sub.startsWith(taskId)`, i.e. no explicit
FK), retry/loop count (real `PipelinePhase.loop.maxRetries`/escalation exists at
the *pipeline* level already), worktree/branch (`WorkspaceSchema` exists and maps
directly onto "WORKTREE wt/<subtaskId>").

### 2.3 Chain

| Mock field | Real counterpart | Status |
|---|---|---|
| `id`, `name`, `desc` | — | missing entity entirely |
| `route` (ordered array of dept ids) | — | missing — closest real shape is `HandoffRuleSchema` (single from→to edge, not an ordered N-step route) or the deleted `ChainSchema` (gone, see §3.1) |
| `gates` (array of `auto`/`ask`, one per step-transition, **owned by the chain**) | `HandoffRuleSchema.tier` (1/2/3) **owned by a from/to subsystem pair**, global/shared across every chain that uses that pair | **mismatch** — today's handoff rules are keyed on `(from, signalKind)`, not on "step N of chain X"; a chain-specific gate override has no home. The mock itself is internally inconsistent here too (see §1.4) — Task detail/New task resolve gate mode from the *handoff rule table* first, but the Chains editor writes to the *chain's own* `gates[]` array, and nothing in the mock ever reconciles the two writes. A real design needs to pick one authority. |

### 2.4 Goal

| Mock field | Real counterpart | Status |
|---|---|---|
| `id`, `title`(→`objective`) | `Goal.id`, `Goal.objective` | exists |
| `project` | — | **missing** — real `Goal`/`GoalRun` schemas carry no `projectId` at all |
| `maker` / `verifier` (role name strings, e.g. `'Coder'`/`'Tester'`) | `Goal.maker` (`MakerRef{kind:'agent'|'pipeline', id}`) / `Goal.verifier` (`VerifierSpec`, discriminated `checks`\|`claude`) | **mismatch** — real shapes reference a *stored definition id*, not a display role name; the mock's UI-level simplification ("MAKER · CODER") would need to resolve the real maker/verifier ids down to a role/agent-name for display, which is a rendering concern, not a schema change, EXCEPT that a `checks`-kind verifier (shell commands, no agent at all) has no "role name" to show — the mock's UI model doesn't account for that verifier kind |
| `runs: [used, max]` | `Goal.maxIterations` (max only) + a live count from `GoalRun` records | exists, needs a live-count query, not stored on `Goal` itself |
| `state` (+ mock-only `parked` override) | `GoalRun` status / a goal's overall derived state | exists conceptually; "PARKED" implies goal-run pause semantics (real `GoalRunnerService` — per memory note `project_task_attachments_delivered`/12.x self-dev arc — already has pause/park handling elsewhere in the system, likely reusable) |
| `iter` (free-text current-iteration summary) | — | derivable from `GoalRun` iteration records, not a stored field |
| `log[]` (3 most recent lines) | — | derivable from `GoalRun` iteration history |

### 2.5 Company

| Mock field | Real counterpart | Status |
|---|---|---|
| `id`, `name`, `desc` | `CompanySchema.id/name/desc` | exists |
| `budget: {daily, weekly, monthly, cap}` (flat dollar amounts) | `CompanySchema.budget` → `ProjectBudgetSchema` (`dailyRuns`, `weeklyRuns`, `monthlyRuns`, `maxConcurrent`, `dailyCostCapUsd`, `weeklyCostCapUsd`, …) | **mismatch** — real budget is *run-count* based with *separate* optional dollar-cost caps; the mock flattens this to 4 plain dollar figures (daily/weekly/monthly/"hard cap") with no run-count dimension at all and no `maxConcurrent`. A real screen needs to decide whether to keep the richer real shape (more fields, more UI) or genuinely simplify the schema — this is a product decision, not just a UI gap. |
| `team[]` (contacts: `id, name, role, vip, note`) | `CompanySchema.people` → `ProjectPersonSchema` (`id?, name, role, vip?, comms_style?`) | exists, near-exact — mock's `note` free-text roughly corresponds to `comms_style` (both are unstructured hints for Communications/Herald drafting), though `note` reads more like a general contact note than specifically a communication-style hint |
| `projectIds[]` (direct array on Company) | **inverted today**: `Project.companyId` (FK lives on Project, not Company) | **mismatch** — not a missing concept, just the inverse direction. The mock's UI (link/unlink from the company side) is achievable against today's schema (`PATCH /projects/:id {companyId}`), no schema change needed, just an inverted write path |

### 2.6 Project

| Mock field | Real counterpart | Status |
|---|---|---|
| `id`, `repo`, `branch`, `desc` | `ProjectSchema.id/name/desc` + (no dedicated `repo`/`branch` fields — closest is `gitRemote` per `03-backend-domain.md` and whatever branch convention `WorkspaceSchema.baseRef` implies at run time) | **mismatch** — mock treats `repo`("acme/api") and `branch`("main") as static project-level config fields; real schema has a validated `gitRemote` (full URL, not "owner/repo" shorthand) and no stored default branch (worktrees resolve a `baseRef` per run) |
| `chain` (default chain id) | — | **missing** — brand-new field, see §1.7 |
| `gate` (`relaxed`/`standard`/`strict` profile) | — | **missing** — brand-new field/enum; today's per-project gating is an arbitrary `GateRule[]` catalog, no single profile summary |
| `cap` (single daily run-count number) | `ProjectBudgetSchema.dailyRuns` (one of several fields) | exists but far narrower — mock drops weekly/monthly/concurrent/cost caps entirely for Projects (contrast: the mock's *Company* budget block, oddly, keeps 4 dollar fields but Project keeps only 1 run-count field — internally inconsistent budget shapes between the two screens) |

### 2.7 Artifact

| Mock field | Real counterpart | Status |
|---|---|---|
| `name` (from `subtask.produces`) | `ArtifactRecordSchema.from` (the phase handoff name) + `.locator` (kind-dependent address) | exists, close |
| `meta` (`<deptCode> · <subtaskId>`) | `ArtifactRecordSchema.producedBy` (`runRef, pipelineId, taskId?, projectId?`) | exists, richer — real provenance already carries more than the mock's UI shows |
| (implicit) kind: vault-note / project-file / PR | `ArtifactKindSchema` | exists, richer than the mock (mock treats every artifact as an opaque filename string) |

### 2.8 Source / Entry

| Mock concept | Real counterpart | Status |
|---|---|---|
| `ENTRY`: `COO decides` \| `Directly into <dept>` | Today's `TaskTarget` union already models "explicit subsystem" (`SubsystemTaskTargetSchema`, explicit-only) vs classifier-routed — **conceptually exists**, but resolves to a single dispatch target, not to "which department starts a multi-step chain" | exists at the routing-primitive level, missing at the chain-entry level |
| `SOURCE` free text on a task, classified client-side into `COO / DIRECT / INBOUND / AUTOMATION` | No unified enum; the pieces exist separately: chat (`chat` module), `ChannelItem` (inbound Slack/email/Jira/GitHub), `Automation` (cron/event triggers), explicit dispatch (any caller) | **missing as a queryable field** — would need either a new `TaskSource` enum stamped at creation, or a runtime join across 4 different origin systems for every task list render (expensive/fragile) |

---

## 3. Backend gap analysis

### 3.1 Chain vs the old (amputated) chains vs today's Handoff — the central question

**What existed and was removed** (`docs/plans/handoff-implementation-plan.md` Part
B, `docs/audit/batches/api-automations-chains.md`): `apps/api/src/chains/*`
including a 349-line `chain-runner.service.ts` that ran a chain as a first-class
`ChainRun`, with its own controllers (`chains.controller.ts`,
`chain-runs.controller.ts`), woven into the **unified run feed, SSE, entity-MCP,
and subsystem status aggregation** — deep integration, not a side feature. It read
"project-file" artifacts by joining `project.path` + a `record.locator` (flagged in
the audit as missing a path-containment check — a concrete historical bug worth
NOT reintroducing). It was retired because the reactive `HandoffService`
(producer-emits-signal → rule-matches → dispatch-or-propose) replaced its 3
hard-coded producer wires more generally, and — implicitly — because a chain that
"decides the next step" duplicated what Handoff now decides more declaratively.

**What survives from that work, unused for chaining today:** `ArtifactRecordSchema`
(`libs/contracts/src/artifacts/artifact.schema.ts`) — its own docblock says
verbatim *"This is the registry the N2 chain primitive consumes: a downstream
pipeline binds its input to an upstream record, so a chain survives restart..."* —
and `PipelineRunnerService.start()`'s trailing `input?: string` parameter (N2b:
"initial input content for the FIRST phase's `consumes` handoff — an upstream chain
artifact"), which writes the string to `<run>/context/input.md`. **The only live
caller of that parameter today is `AutomationSchedulerService.dispatch()`**, which
feeds an automation's free-text `prompt` in as first-phase input — **not** an
artifact from a prior run. There is **no service anywhere that, on one pipeline's
completion, looks up its `ArtifactRecord` and starts the next pipeline with it as
input.** The plumbing (artifact provenance + a "seed the first phase" hook) exists;
the orchestration (walk an N-step route, decide when step K+1 starts) does not.

**What the design's Chain actually needs, concretely:**
1. A **new `Chain` entity** (`libs/contracts/src/chains/chain.schema.ts`, a fresh
   name/file to avoid reviving the deleted module by the same path — or a
   deliberate decision to reuse the old path since it's free): `id, name, desc,
   route: SubsystemId[], gates?: ('auto'|'ask')[]` at minimum. Given §2.3's finding
   that gate mode should probably NOT live per-chain-step (it collides with the
   handoff-rule catalog's own authority), the smallest-friction version *drops*
   `gates[]` from Chain entirely and always resolves gate mode via `HandoffRule`
   lookups keyed on the (from-dept, to-dept) pair actually being crossed — this
   also means a chain never needs its own separate rule-authoring UI, the existing
   Handoff rule editor (`SubsystemDrawer` → Handoff tab, already built) is reused
   as-is. **Recommendation: do not add a chain-owned gate field.**
2. A **parent Task entity distinct from a dispatch record** — today `ScheduledTask`
   IS the dispatch record (task and its one run-target are the same file). The
   design needs: a parent (`id, title, chainId, projectId, source, cost-rollup,
   output`) that owns an ordered list of **Subtask** records, each of which is
   essentially today's `ScheduledTask` shape (dispatched to one department's
   pipeline) PLUS a pointer back to its parent + its position in the route. This
   is the single largest schema change in scope: either (a) `ScheduledTask` grows
   a `parentTaskId?`/`chainStep?` and a NEW lightweight `ParentTask` wraps them, or
   (b) `ScheduledTask` itself becomes the "subtask" concept and a new
   `ChainRun`-like wrapper (name it something that doesn't collide with the old,
   deleted `ChainRun`) is the parent. (a) is additive and non-breaking; (b) risks
   reviving exactly the "chains woven into every unified surface" coupling the
   Part-B retirement was fixing — **recommend (a)**.
3. A **ChainWalkerService** (or fold into `TaskSchedulerService`): on a subtask's
   terminal `done`, look up the parent's chain route, find the next step; consult
   `HandoffService`/gate rules for that (from,to) pair; if AUTO → immediately
   dispatch a new subtask (a `ScheduledTask`/`PipelineRunnerService.start()` call
   with the previous subtask's `produces` artifact content threaded in as the N2b
   `input` param — the wiring for this half already exists); if ASK → park a NEW
   `ApprovalRunKind` (`chain-handoff` or reuse `handoff-proposal`) and resume via
   the existing approval-resolve path, mirroring `HandoffService.resume`. On
   terminal `error` — decide whether the whole parent task halts (matches "PR is
   the gate, never auto" spirit — probably halts and surfaces to the operator
   rather than silently skipping a step).
4. **Classifier changes**: today's `TaskClassifierService` picks ONE subsystem,
   then ONE unit within it (agent/pipeline). A Chain-aware classifier needs a
   **third mode**: "pick a chain" (route across departments) vs "pick a unit"
   (single-department dispatch, today's existing behavior, still needed for tasks
   with no cross-department flow — e.g. the mock's own `personal`/`finance` chains
   are single-department, so "chain" and "single dispatch" aren't even cleanly
   separable types, just chains of length 1). Smallest viable: extend
   `TaskTargetSchema` with a new `{kind: "chain", id}` member (mirroring how
   `goal`/`subsystem` were added additively before), classified **explicitly only**
   at first (operator picks from the New Task chain-chip row, exactly as the mock
   does) with auto-classification into a chain as a stretch goal — the mock's own
   "COO proposes a chain" auto-guess is a simple keyword-regex stub
   (`ZC.classify`), so a real v1 could similarly keep chain-auto-pick cheap
   (deterministic keyword scorer against chain descriptions) rather than adding a
   third LLM classification stage immediately.
5. **Per-subtask worktree** — `WorkspaceSchema` (`branch, path, baseRef`) already
   exists and is created per pipeline-run today; this requirement is *already met*
   by existing plumbing as long as each subtask dispatches its own
   `PipelineRunnerService.start()` call (which it does, per point 3) — **no new
   schema needed here**, just confirming the naming convention (`wt/<subtaskId>`)
   is cosmetic, not a new mechanism.
6. **Artifact passing (research.md → PR)** — `ArtifactRecordSchema` +
   `ArtifactsStorageService` already model this generically (kind: vault-note /
   project-file / pr, with full producer provenance) and are explicitly preserved
   as "the handoff substrate" by the retirement plan. The gap is purely the
   *walker* (point 3) reading the right record and feeding it into the next
   subtask's `input` — no new artifact schema required.
7. **Gates at each handoff** — already covered: reuse `HandoffService`/
   `HandoffRuleSchema` as-is, scoped to (from-subsystem, to-subsystem) pairs. One
   real addition: today's `HandoffSignalSchema` models a *producer emitting a
   signal about something that happened* (a CVE, a post-merge-red, a research
   artifact) matched against rules by `(from, signalKind)`. A chain-step handoff
   is slightly different — it's not "a signal was emitted", it's "subtask N of
   THIS parent task finished, and the parent's route says N+1 is department Y" —
   so the walker likely synthesizes a `HandoffSignal` (`kind: "chain-step"` or
   similar, `from: <dept>`, `body`: artifact content, `fingerprint`: `<taskId>.
   <n>`) purely to reuse `HandoffService.evaluate`'s tier resolution + idempotency,
   rather than the walker re-implementing tier logic itself. This is a clean reuse
   seam, not a rewrite.

**Smallest viable version:** (1) additive `Chain` entity, gate-less (defers 100% to
existing Handoff rules); (2) `parentTaskId`/`chainStep`/`chainId` fields added to
`ScheduledTask` (additive, optional, old tasks parse unchanged); (3) a
`ChainWalkerService` triggered off existing run-completion hooks
(`PipelineRunnerService`/`AgentRunnerService` already have terminal-state hooks
used by `ActivityRecorderService`, `LimitResumeService`, etc. — one more subscriber)
that (a) on `done`, synthesizes a `HandoffSignal` and calls `HandoffService.evaluate`
against a new/extended rule set scoped by chain-step, (b) on tier-1/2 dispatch,
calls `PipelineRunnerService.start()` with the artifact as `input`; (4) New Task
form gets a chain picker (explicit only — auto-pick can be a keyword stub exactly
like the mock, or deferred); (5) Task detail becomes a read-model joining a parent
task + its subtasks' existing `ScheduledTask`/`PipelineRun` records — no new
persistence for "the route", since `Chain.route` + each subtask's own `dept`
already reconstructs it. **Full version** adds: LLM-classified chain auto-pick
(third classifier stage or an extension of the existing stage-1 "pick a subsystem"
verdict into "pick a subsystem OR a chain"), a chain-level cost/duration rollup
service (rather than summing at read time), and possibly a `chain-handoff`-specific
`ApprovalRunKind` with its own richer approval-sheet context (today's generic
`detail`/`risk` fields on `Approval` are probably sufficient without a new kind).

### 3.2 Task model: parent/subtask split — services touched

- **`TaskSchedulerService`** — currently the single dispatch point
  (`resolveSubsystemTargetOrNull`, the 0/1/N-owned-units rule). Needs to learn
  "dispatch subtask 1 of a chain" as a variant of its existing subsystem-target
  resolution (a chain step names a department; resolving *which pipeline within
  that department* runs reuses the exact same `classifyWithinSubsystem`/
  `SUBSYSTEM_FALLBACK` machinery that resolves an explicit `subsystem` target
  today — this is the single cleanest reuse in the whole gap analysis).
- **`TaskClassifierService`** — needs the new chain-vs-unit distinction (§3.1
  point 4).
- **`PipelineRunnerService`** — no interface change needed beyond what N2b
  already added (`input` param); needs a caller.
- **`HandoffService`** — reused as-is for tier resolution; may need a
  `HandoffSignalKind` registry entry for a synthetic "chain-step" kind (cheap,
  additive, matches the existing registry pattern for pending/active kinds).
- **`GoalRunnerService`** — **not directly implicated by Chain**, but the mock's
  Goals screen implies goals stay project-scoped in spirit even though the real
  schema has no `projectId` (§2.4) — if that's wanted, it's a one-field additive
  schema change, unrelated to chains.
- **New: `ChainWalkerService` / `ChainsStorageService`** — the two new pieces.

### 3.3 Company/Project/Goal — smaller, mostly additive gaps

- `Project.chain` (default chain id) and `Project.gate` (relaxed/standard/strict
  profile enum) — both purely additive optional fields, **no migration risk**.
  `gate` needs a decision on what it actually *does*: either (a) it's cosmetic
  labeling with no enforcement (just documents intent), or (b) it's a real
  shorthand that expands into a pre-set bundle of `GateRule`s at project-creation
  time (editable individually afterward) — (b) matches the "PROJECT GATE RULES"
  list shown read-only beneath it in the mock (implying the profile *seeds* those
  rules rather than *being* them at runtime) — **recommend (b)**: a
  `applyGateProfile(projectId, profile)` one-shot seeding action, not a live
  runtime switch. This avoids inventing a second gate-evaluation code path
  alongside the existing rule-bucket evaluator.
- `Company.budget`/`Project.cap` shape mismatch (§2.5/2.6) — a product decision
  (simplify the real schema to match the mock's flatter dollar-only model, or keep
  the richer real schema and simplify only the *UI* to show fewer fields per
  screen). **Recommend keeping the real schema and simplifying the UI** — the
  richer schema is already load-bearing (concurrency caps, cost caps used by the
  budget guard) and collapsing it would be a regression for existing budget
  enforcement, whereas trimming which fields a screen exposes is UI-only.
- `Task.source`/`picked` (§2.1) — smallest viable: a `source: string` free-text
  field stamped at task-creation time by whichever path created it (chat, direct
  department dispatch, channel-triage, automation) — cheap, additive, matches the
  mock's own "just a string, classified client-side by regex" approach. `picked`
  (auto/fixed/override) is a similarly small additive enum, set once at chain
  selection time.
- `Goal.projectId` (§2.4) — one additive optional field.

---

## 4. Screen → current route/component/API mapping

| Design screen | Verdict | Current code |
|---|---|---|
| **Tasks** (list) | 🔁 exists but must move/restructure | Closest today is `/archiv` (`apps/web/features/archive`) — search + subsystem filter + infinite scroll over the unified run feed, plus `/chat`'s `ChatTasksPanel` gutter (active only). Neither has COMPANY/PROJECT/DEPARTMENT/STATE/SOURCE as a 5-axis filter bar, neither renders a per-row "chain progress" route strip (no chain concept to render), and both are *run*-scoped, not *parent-task*-scoped. Needs the new parent-task read-model (§3.1) before the table can be re-skinned. |
| **Task detail** | 🆕🔌 needs backend/contract | No real equivalent — closest is `ChatTaskDetailColumn`/`RunDetail` (a single run's detail, no multi-subtask route strip, no borrowed-agents-per-subtask view, no cross-subtask artifact/run rollup). Needs §3.1's parent/subtask model end to end. |
| **New task** | 🔁 exists but must move/restructure | `NewTaskProvider`/`CommandLine` composer exists app-wide (title+brief+attachments+paths, dispatches via classify) — but has no ENTRY (direct-to-department) selector, no CHAIN override chips, no route-preview panel. The underlying create-and-classify flow is the right substrate; the UI and the chain-aware routing are both new. |
| **Chains** (library+editor) | 🆕🔌 needs backend/contract | No real equivalent at all (`/chains` was deleted). Full §3.1 build. |
| **Goals** | 🆕 frontend-only new (mostly) | `features/goals` query/mutation hooks exist (`useGoalsQuery`, `useCreateGoalMutation`, `useResumeGoalRunMutation`) with **no screen** (`02-web-routes.md` §8 item 5). The screen is genuinely new UI over already-real data, modulo §2.4's maker/verifier display mismatch and the missing `projectId`. |
| **Companies** (catalog+detail) | ✅ exists (re-skin) | `/companies`, `/companies/[id]`, `/companies/new` already implement basics+budget+people-roster+linked-projects (reverse lookup) — this is the closest 1:1 match in the whole scope. Gaps: budget shape (§2.6), inline "create project from company screen" flow (today's company screen links *existing* projects only, per `02-web-routes.md` — doesn't create new ones inline), two-click delete-confirm pattern (verify whether today's delete flow matches or needs adjustment), `ALL TASKS FOR THIS COMPANY →` cross-filter link (new interaction, small addition). |
| **Projects** (catalog+config) | 🔁 exists but must move/restructure | `/projects` + `/projects/[id]` (`ProfileScreen`, 5 tabs: overview/profile/secrets/integrations/roadmap) is far richer than this mock's flat single-panel CONFIG view. The mock **compresses** company-link, chain, gate-profile, budget-cap, gate-rules-list, and task-list into one un-tabbed panel — either the real tabbed structure survives underneath (this mock screen is just tab "overview" reimagined) or the redesign is deliberately flattening it (in which case secrets/integrations/roadmap tabs need a new home — see §5). Needs new fields per §3.3. |

---

## 5. Real features NOT in this design scope — where they'd go / open decisions

- **Teams entity** (`/teams`, "the layer between Company and Project", owns a
  read-only knowledge base) — **absent from the entire ZibbyCorp mock set**
  (checked: not in Work Screens, not in the IA sitemap's WORK section, not
  mentioned in the migration table). ❓ **Decision needed**: was Team deliberately
  dropped from the redesign (folded into Company or Project), or simply not yet
  designed? The IA's migration table has no `teams` row at all (13 of today's 14
  top-level segments are mapped; `teams` — a 15th, real, existing segment — is
  the one segment missing from a list that otherwise looks exhaustive). This
  looks like an oversight worth flagging back rather than a considered removal.
- **Roadmap board per project** (Jira/GitHub-synced epic/task board, "jen moje
  issues" filter, source picker, autoPlay) — not present in this mock's flattened
  Project CONFIG panel. Likely candidate: a `Department detail` tab per IA §04
  (`Team · Subtasks · Pipelines · Skills · Integrations · Automations · Hooks`)
  doesn't list Roadmap either — could live back under Project (a tab the mock
  simply didn't design yet) or become chain-entry automation (roadmap sync →
  auto-creates a Task with a pre-picked chain). ❓ decision needed.
- **Project tabs overview/profile/secrets/integrations/roadmap** — the mock's flat
  CONFIG panel has none of secrets/integrations/roadmap. Integrations specifically
  maps cleanly onto the IA's **Department detail → Integrations tab** (a
  department's monitors/channels), which changes *where* a project's Slack/email/
  Jira/GitHub integration config lives — arguably a bigger IA decision than this
  scope's screens show (does an integration belong to a Project, a Department, or
  both?). Today integrations are project-scoped; the IA sitemap suggests
  department-scoped registries with per-department binding (§04's SYSTEM →
  Registries note: "global libraries that departments bind to"). This is a real
  architectural fork, not just a missing screen.
- **Project budget/prOpenMode/autonomy/rhythm/standup** — `prOpenMode` (draft vs
  ready PRs), `autonomy_policy`, `daily_rhythm`/standup have no visible home in
  this mock. Budget partially reappears (flattened, §2.6/3.3). `prOpenMode` /
  `autonomy_policy` / `daily_rhythm` aren't mentioned anywhere in Work Screens or
  the IA sitemap. ❓ Likely candidates: a Project "profile" sub-tab the mock
  hasn't drawn yet (the CONFIG panel reads like a minimum viable slice, not a
  deliberate feature cut), or Department-level automation config (rhythm/standup
  overlaps conceptually with "Automations tab" per department in the IA).
- **Archive** (`/archiv`) — subsumed conceptually by **ACTIVITY → Runs** in the IA
  sitemap ("every run, events, retries, cost") — a reasonable 1:1, out of this
  scope's screens (Activity Screens.dc.html covers it, not read for this report).
- **Task attachments** (`AttachmentSchema`, upload-and-grant flow) — not shown in
  the mock's New Task form (title/brief/entry/project/chain only, no file
  attach). Likely a straightforward omission to re-add rather than a decision —
  the underlying schema/upload plumbing is unrelated to the chain work and can be
  ported as-is.
- **CommandLine @-mentions, pins, run resume/stop** — none appear in this scope.
  @-mentions (path/agent mention-to-grant-access) has no obvious mock
  counterpart yet; pins (favorite agent/pipeline) likewise absent (the mock's
  Agent pool screen, out of scope here, might carry it). Run resume/stop — the
  mock's Task-detail RUNS panel is read-only (no stop/resume button on a row),
  though a real implementation obviously still needs it (interrupted/paused-limit
  states exist in `RunStatusSchema` and need an operator action).

---

## 6. Reusable UI components implied by these screens

All follow `ZibbyCorp Design System.md` §8 (radius 0, mono-uppercase controls,
1px hairlines) — component names below are proposed, not mock-literal.

1. **`FilterBar`** — a row of mixed controls: N `<select>`s + N segmented
   controls + a conditional `CLEAR FILTERS` button, with dependent-option
   cascading (Company→Project, as in Tasks). Props: `filters: {key, type:
   'select'|'segmented', options, value, onChange}[]`, `onClear`.
2. **`SegmentedControl`** — already documented in the design system (§8), needs a
   generic implementation: `items: {label, value, dot?}[]`, `value`, `onChange`.
   Used for STATE/SOURCE filters, GATE PROFILE, LIGHT/DARK theme toggle
   elsewhere.
3. **`EntityTable`** — grid-template-columns row list with a header row + button
   rows (whole row clickable) + empty state. Used identically by Tasks, Projects,
   Company's linked-projects list, Company's open-tasks list (a narrower-column
   variant), Project's task list. Props: `columns: {key, label, width, align}[]`,
   `rows`, `onRowClick`, `emptyText`.
4. **`ChainRouteStrip`** — the horizontal "SUB N · CODE" card sequence with `→
   GATE` connectors, in two sizes: full (Task detail, corner-bracketed focus
   panel) and compact-chip (Tasks table row, New task preview, Chains library row
   summary string). Props: `steps: {n, code, name, state, pipeline?, produces?,
   selected?}[]`, `gates: {mode:'AUTO'|'ASK', onClick?}[]`, `size: 'full'|
   'compact'|'chip'`, `onStepClick`.
5. **`StatusDot`** / **`StatePill`** — already conceptually in `zibby.js` (`B.dot`,
   `B.S`) — a square 7–9px dot in one of the 6 status colors, optionally
   animated (breathe/pulse per state), plus a bordered pill wrapper
   (dot+uppercase label) used everywhere (task rows, subtask cards, goal cards,
   company rows).
6. **`AgentGlyph`** — procedural seeded pixel sprite (already speced in the
   design system §7), sizes 18/22/30/48/128, state-tinted + optional glow. Used
   in Borrowed Agents cards, COO glyph in New-task preview, presumably the Agent
   pool/profile screens (out of scope).
7. **`PipelineStepStrip`** — the phase-chip row with `→`/`⇄` connectors reflecting
   loop back-edges — distinct from `ChainRouteStrip` (department-level) but
   visually identical pattern one level down (phase-level, inside one subtask).
   Props: `phases: {roleU, state, isLoopBack}[]`, `currentIndex`.
8. **`EditableChainStep`** card — the Chains-editor's 170px reorderable step card
   (name, pipeline list, ← → reorder, ✕ remove) + the "ADD DEPARTMENT" dashed
   trailing cell. Props: `steps`, `onReorder`, `onRemove`, `onAdd`,
   `availableOptions`.
9. **`GateToggle`** — the small `AUTO`⇄`ASK` clickable pill used both read-only
   (Task detail/New task, resolved from handoff rules) and editable (Chains
   editor) — same visual, different mutability. Props: `mode`, `onClick?`
   (absent = read-only).
10. **`MetricStrip`** — N-column divider-bounded stat block (label mono 10 +
    value 20px/500 tabular-nums) — Company detail's 4-metric row; also matches
    the design system's Inspector §8 "metric strip: 3 columns" spec, so this is
    a shared primitive across Work and Org screens.
11. **`GoalCard`** — self-contained card: header (id/project + state), title,
    maker⇄verifier chip pair, budget progress bar, iteration summary, mini-log,
    action row. Props: the whole `Goal` view-model + `onAction(actionKey)`.
12. **`BudgetFieldGroup`** — labeled `$`-prefixed numeric input with a unit
    suffix, in a dirty/save/discard group (Company's DEFAULT BUDGET block).
    Props: `fields: {key, label, value, unit}[]`, `dirty`, `onChange`, `onSave`,
    `onDiscard`.
13. **`ContactRow`** — avatar-initial tile + name/role stack + `KEY`(vip) toggle
    + remove, plus an inline add-row (name+role+ADD). Reusable for any
    person-roster (Company contacts here; likely also a Department "Team" tab
    roster, out of scope, though that one is agents not people).
14. **`ConfirmDeleteButton`** — two-click confirm pattern (label swaps to
    `CONFIRM DELETE`, dot appears, border/color escalates, a warning sentence
    appears elsewhere in the panel) — Company delete; likely wanted generically
    (Chain delete is conspicuously *absent* in this mock, per §1.4 — worth
    reusing this component there too once that gap is closed).
15. **`RoutePreviewPanel`** — corner-bracketed side panel: label + COO-glyph
    suggestion sentence + `ChainRouteStrip` (compact) + fixed footer caption.
    New-task-specific composition of #4 + #6.
16. **Corner-bracket frame** — not a component so much as a CSS utility/wrapper
    (`FocusFrame`) — four positioned 8–10px L-marks, used on Task detail's route
    panel, New task's preview panel, and (per the design system doc) the CEO/COO
    org node and hero glyph tiles elsewhere — worth extracting once rather than
    inlining the 4-`<div>` pattern per screen (the mock itself already repeats
    this exact markup verbatim in 2+ places within this scope alone).

---

## Key files referenced

- Design: `design/ZibbyCorp/Work Screens.dc.html`, `design/ZibbyCorp/zc-data.js`,
  `design/ZibbyCorp/Information Architecture.dc.html`,
  `design/ZibbyCorp/ZibbyCorp Design System.md`
- Contracts: `libs/contracts/src/tasks/task.schema.ts` (`ScheduledTaskSchema`,
  `TaskTargetSchema`), `libs/contracts/src/pipelines/pipeline.schema.ts`
  (`PipelinePhaseSchema`, `PhaseLoopSchema`, `PipelineOutputSchema`),
  `libs/contracts/src/handoff/handoff.schema.ts` (`HandoffRuleSchema`,
  `HandoffSignalSchema`), `libs/contracts/src/artifacts/artifact.schema.ts`
  (`ArtifactRecordSchema` — the "N2 chain primitive" docblock),
  `libs/contracts/src/companies/company.schema.ts`,
  `libs/contracts/src/teams/team.schema.ts`,
  `libs/contracts/src/projects/project.schema.ts`,
  `libs/contracts/src/goals/goal.schema.ts`, `libs/contracts/src/goals/
  goal-run.schema.ts`
- API: `apps/api/src/tasks/task-scheduler.service.ts`,
  `apps/api/src/tasks/task-classifier.service.ts`,
  `apps/api/src/pipelines/pipeline-runner.service.ts` (N2b `input` param, line
  ~261-269), `apps/api/src/automations/scheduler.service.ts` (the only live
  caller of that `input` param, line ~154-169), `apps/api/src/handoff/
  handoff.service.ts`
- Docs: `docs/plans/handoff-implementation-plan.md` (Part B = chains retirement),
  `docs/audit/batches/api-automations-chains.md` (old `chain-runner.service.ts`
  audit, pre-deletion)
- Prior research: `02-web-routes.md`, `03-backend-domain.md` (full current
  web/backend inventory, not re-derived here)
