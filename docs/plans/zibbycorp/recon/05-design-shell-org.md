# ZibbyCorp design audit — App shell, ORG section, visual foundation

Scope per assignment: `ZibbyCorp App.dc.html` (shell), `Org Screens.dc.html`,
`Dashboard.dc.html`, `Blueprint Screen.dc.html`, `ZibbyCorp Splash.dc.html`,
`ZibbyCorp Directions.dc.html`, `zibby.js`, `zc-data.js`. Cross-referenced against
`ZibbyCorp Design System.md`, `Information Architecture.dc.html`, and the three
prior research docs (`01-design-system.md`, `02-web-routes.md`,
`03-backend-domain.md`) in this scratchpad. Read-only; no rendering was done (the
markup is exhaustive inline-style HTML — every value below is read directly from
source, not estimated).

**Two design generations coexist in this folder.** `ZibbyCorp App.dc.html` +
`Org Screens.dc.html` are the **current, IA-aligned build**: they load
`zc-data.js` (11 corporate departments dev/ops/sec/rel/inc/rnd/com/qa/knw/fin/per,
COO=Zibby, CEO=operator, hash routing `org/...`). `Dashboard.dc.html` +
`Blueprint Screen.dc.html` are an **earlier prototype**: they load only
`zibby.js`, model 8 Silicon-Valley-generic departments (Engineering, Product,
Design, Marketing, Sales, Support, Finance, Operations) with fixed human-named
headcount (Kevin, Stuart, Bob, Otto, Chris…), no hash routing, and label the
operator-facing entity "EXEC-00 · Zibby · Chief Orchestrator" instead of
COO-reports-to-CEO. Treat Dashboard/Blueprint as **superseded reference only**
for the glyph system and layout grid — do not implement their department/agent
data model. `ZibbyCorp Splash.dc.html` and `ZibbyCorp Directions.dc.html` also
still import `zibby.js` only (unconverted), so their captions/counts ("8
departments · 50 agents") are stale relative to the current 11-department model;
their *mechanics* (glyph animation choreography, blueprint-doc presentation) are
still current.

---

## 1. Shell spec

### 1.1 Grid

```
100vw × 100vh, min-width 1440px, min-height 900px, overflow hidden
grid-template-rows: 56px minmax(0,1fr)
```
Row 1: `<header>`. Row 2: a nested grid `grid-template-columns: 280px minmax(0,1fr)`
— left rail (280px, fixed) + `<main>` (fluid). **There is no right rail in the
current shell** — Dashboard.dc.html's legacy 3-column `280px / 1fr / 400px` (rail
+ main + inspector) was collapsed to 2 columns in the real build; the Design
System doc's `rail-right: 400px` token is carried over from Dashboard but is
**not instantiated anywhere in ZibbyCorp App.dc.html**. The "inspector" role
(agent detail) moved to being its own routed screen (`org/agent/:id`, described
§2.4) rather than a persistent right rail.

Background: the 24px paper-grid (`--grid` 1px lines) is painted once on the root
div, showing through every screen (screens sit on `--bg`, cards on `--panel`).

### 1.2 Header (56px, row 1)

`display:flex; align-items:center; gap:18px; padding:0 20px; border-bottom:1px
solid var(--line); background:var(--panel)`. Left→right:

1. **Logo button** (`goHome` → `org/map`): 22px `PixelGlyph` (seed "Zibby",
   state idle) + `ZIBBYCORP` wordmark (mono 13/600/0.18em).
2. **Top nav** (`<nav>`, mono 11/0.14em, full header height): 6 buttons, one per
   section — `ORG, WORK, ACTIVITY, POLICY, KNOWLEDGE, LEDGER`. Active section:
   text `--ink` + 1px `--ink` bottom border; inactive: `--ink3`, transparent
   border. **`SYSTEM` is deliberately excluded from top nav** — it's reached
   only via the ⚙ icon button at the header's far right (IA's "SYSTEM ⚙ OUT OF
   NAV" is honored exactly). A `badge` field (pending-approval count) is
   computed per nav item (`k === 'policy' && Z.approvals.length ? pad(count) :
   ''`) but **is never rendered** in the button markup — dead code / an
   implemented-but-wired-nowhere approval-count badge on the POLICY tab.
3. **Spend gauge button** (`goSpend` → `ledger/spend`, title "Claude Code usage
   limits"): two stacked micro-bars, `5H` and `WEEK`, each
   `grid-template-columns:44px 96px 30px`, 2px track (`--line`) / 2px fill
   (`--ink`), right-aligned tabular-nums percentage. This is the header's ONLY
   live-status indicator — **no "active count" and no visible CEO
   name/avatar/greeting exist in the actual header markup**, even though
   `Information Architecture.dc.html` §04 explicitly specifies "ALWAYS ON ·
   HEADER: CEO, ACTIVE COUNT, LIMITS, ⌘K." This is a build/spec gap — flagged
   as a decision in §5.
4. **Search trigger** (`openPalette`): bordered `--line2`, padding 6×10, gap 14,
   `SEARCH` + `⌘K` in `--ink3`. Opens the command palette (§1.6).
5. **Settings icon** (`goSystem` → `system/settings`): `⚙` glyph, border
   `--line2` (or `--ink` when the SYSTEM section is active — `sysLine`),
   padding 5×9.

### 1.3 NEEDS YOU rail (280px, left, always visible)

`border-right:1px solid var(--line); background:var(--panel)`. Header row:
`NEEDS YOU` label (mono 11/0.14em/`--ink3`) — no count badge in this shell build
(Dashboard.dc.html's legacy version *did* show a `--ink`-colored count next to
the label; the current App.dc.html dropped it, relying on the card list length
alone).

Scrollable card list (`overflow-y:auto`), each **Approval card**:
`border:1px solid var(--line2); padding:12px; background:var(--bg)`. Structure,
top→bottom, matches the Design System's "Approval card" spec exactly:
1. Row: 30px `PixelGlyph` (glow on) + agent name (mono 11/600, uppercase) / `KIND
   · DEPT-CODE` (mono 10, `--ink3`) stacked + wait-time right-aligned (mono 10,
   `--ink3`).
2. Request text (sans 13, `text-wrap:pretty`).
3. Task reference line (mono 10, `--ink3`): `TSK-XXXX · TITLE…` (title truncated
   to 26 chars, uppercased) or `NO TASK · DEPT NAME` when the approval isn't
   task-scoped (e.g. the Finance spend-cap-raise approval).
4. Action row (gap 6, mono 10/0.12em): **APPROVE/REPLY** (primary, `flex:1`, bg
   `--ink`/text `--panel`) — label is `REPLY` when `kind === 'QUESTION'`, else
   `APPROVE`; **DENY** (secondary, `flex:1`, hover→`--panel2`/`--ink`); **→**
   (icon-only secondary, opens the full sheet).
   - **Primary click on a non-QUESTION card resolves the approval immediately**,
     with no confirmation step (`quickApprove`: `ZC.resolve(id,'APPROVED')`
     directly) — a single, un-gated click for PUSH/HANDOFF/SPEND kinds. This
     conflicts with the current app's `HoldButton` press-and-hold pattern for
     high-risk actions (see §5/decision).
   - QUESTION-kind primary click always opens the sheet (needs a text answer).
5. Empty state (`noApprovals`): dashed `--line2` border, "Nothing is waiting for
   you. Agents continue on their own until a gate fires."

### 1.4 Main content area

`grid-template-rows:44px minmax(0,1fr)`. Row 1 = **subnav bar**
(`border-bottom:1px solid var(--line)`, mono 10/0.14em, `padding:0 20px`):
- Section label (`{{ sectionU }}`, `--ink3`, right-bordered separator).
- Per-section subnav tabs (from `SECTIONS` map, §1.7) — active: `--ink` text + 1px
  `--ink` bottom border; inactive: `--ink3`.
- Optional breadcrumb (`crumb`, only when route has a 3rd/4th segment):
  `DEPARTMENT · <CODE>` / `AGENT · <id>` / `DIRECT LINE · <CODE>` / `TASK ·
  <id>` / `NEW TASK`, prefixed with a `/` in `--ink3`.
- **`+ NEW TASK` button** pinned right (`margin:8px 0 8px auto`, bg `--ink`,
  always visible regardless of section — a global create affordance living in
  the subnav bar, not the header).

Row 2 = routed screen content, `overflow:auto; padding-bottom:72px` (the bottom
padding reserves room for the floating COO dock so content never sits under it).
Content is a `dc-import` keyed on which top-level section is active (`isOrg` /
`isWork` / `isActivity` / `isPolicy` / `isKnowledge` / `isLedger` / `isSystem`),
i.e. **7 section bundles** map to 7 separate `.dc.html` files — Org Screens is
one such bundle.

### 1.5 COO dock (floating, bottom-right of `<main>`)

`position:absolute; right:20px; bottom:16px; width:420px; background:var(--panel);
border:1px solid var(--ink); z-index:5`. Two states:

- **Collapsed** (default): single row, `padding:8px 8px 8px 12px` — a toggle
  button (20px COO glyph, state = `thinking` while listening else `working`,
  no glow, + `COO` label) · a text input (`flex:1`, height 32, placeholder "Ask
  Zibby or describe a task" / "Listening…") · a **VOICE** button (bordered,
  shows either a static 7px ring icon or, while listening, 4 animated bars
  `zc-bar`) · a **SEND** button (bg `--ink`).
- **Expanded** (`dockOpen`): a 440px-tall chat panel opens above the input row,
  bordered bottom by `--line`. Header: 30px COO glyph (glow) + "Zibby" (14/500)
  + "COO · ROUTES, CLASSIFIES, CHATS" (mono 10, `--ink3`) + CLOSE button.
  Message list (`overflow-y:auto`, auto-scrolls to bottom on new message):
  - **You** bubbles: right-aligned, `max-width:80%`, bg `--ink`/text `--panel`.
  - **COO** bubbles: left-aligned, `max-width:86%`, bordered `--line2`/bg
    `--bg`; when the reply carries a classified chain proposal (`m.act` =
    `CREATE TASK`), two action buttons render inline: **CREATE TASK** (primary,
    calls `ZC.createTask`, then navigates to `work/task/<newId>`) and **OPEN
    FORM →** (secondary, goes to `work/new`).
  - Focusing the input (`onFocus`) auto-opens the dock even without typing.
  - Enter key in the input sends (`onDraftKey`); text is classified client-side
    via keyword regex (`ZC.classify`) to propose a chain before any task
    exists.
  - **Voice**: clicking VOICE sets `listening:true`, opens the dock, fakes a
    1.6s "recognized speech" delay (hardcoded demo string), then auto-sends at
    2.6s if still listening — i.e. the mock has no real STT, just a scripted
    demo of the interaction shape (type-then-auto-submit). Click again to stop
    early.

### 1.6 Command palette (⌘K, global overlay)

`position:absolute; inset:0; z-index:30`, scrim
`color-mix(in oklch, var(--bg) 70%, transparent)`, centered top (`padding-top:
120px`). Panel: 600px wide, `border:1px solid var(--ink)`, one corner-bracket
tick (top-left only, 10px). Structure:
1. Input row: `⌘K` icon + text input (48px tall, borderless, 15px, auto-focused
   on open, placeholder "Jump to a page, department, agent, task or /command").
2. Result list (`max-height:420px`, `overflow-y:auto`): each row
   `grid-template-columns:90px minmax(0,1fr) auto` — KIND (mono 10, `--ink3`) ·
   label (13px) · meta (mono 10, `--ink3`) · row background `--panel2` when
   selected via keyboard.
3. Footer hint bar: `↑↓ MOVE · ↵ OPEN · ESC CLOSE` (mono 10, `--ink3`).

**Index composition** (`palList()`, client-built from `ZC`/`SECTIONS`, capped at
40 results after filtering): every section/subnav page (`PAGE`, e.g. "ORG /
AGENT POOL"), a synthetic `WORK / NEW TASK` entry, every department
(`DEPARTMENT`), every agent in the pool (`AGENT`, label = `name · role`), every
client company (`COMPANY`), every task (`TASK`), and every slash command
(`COMMAND`, from `ZC.registries.commands` — 8 commands: `/task /chain /approve
/brief /distill /budget /pause /status`, though only `/task /brief /budget
/distill /approve` have a real routed destination wired — `/chain`, `/pause`,
`/status` all fall through to `system/registries`). Filter is a single
substring match across `label + meta + kind`, case-insensitive, no fuzzy/ranked
scoring. **Unlike the current app's `ChatSearch`, this index deliberately
covers agents, departments, and commands together with pages** — a broader,
flatter index than today's 12-kind `ChatSearch` (§4 of `02-web-routes.md`
already flags today's index as narrower than its own nav — this design goes the
other way and indexes *more* than its own top nav exposes, e.g. slash commands
and individual agents have no other nav entry point at all).

### 1.7 Approval sheet (right-side drawer, opened from a rail card's `→`, a
palette pick of a pending item, or `Policy Screens`' `open-approval` prop)

`position:absolute; inset:0; z-index:20`, scrim as above,
`display:flex;justify-content:flex-end`. Panel: 560px wide, full height,
`border-left:1px solid var(--ink)`, `overflow-y:auto`. Structure top→bottom:
1. Header bar: `APPROVAL · <id>` · `<KIND>` · right-aligned `WAITING <wait>` ·
   `ESC` close button.
2. 48px glyph (glow) + request text (22px/500) + `AGENT · ROLE · DEPT NAME`
   meta line.
3. **RULE THAT FIRED** block: bordered `--line2`/bg `--bg`, the human-readable
   gate rule text (e.g. "api · git.push to a shared remote asks").
4. **ARTIFACT** block: a bordered diff/log viewer, each line pre-formatted mono
   11, `+`-prefixed lines get a `--panel2` background highlight, `-`-prefixed
   lines get dimmed (`--ink3`) text — a lightweight unified-diff renderer, not
   a real syntax-highlighted diff component.
5. **TASK CHAIN** block (only `hasTask`): `TASK · <id>` / chain name, then the
   full department route rendered as a row of bordered chips (dept code + a
   state dot each) joined by `→` arrows — the current department's chip is
   highlighted `--ink`, in-flight status dots are live-colored — plus the
   parent task's title.
6. **3-column metric strip** (`border-top`/`border-bottom` `--line`): `COST SO
   FAR`, `SUBTASK` (e.g. `02/03`), `WAITING` — matches the Design System's
   generic "metric strip" component exactly.
7. Conditional **answer/reason input** (`showInput`): shown for QUESTION kind
   (label "YOUR ANSWER") or once DENY has been clicked once (`denyMode`, label
   "REASON FOR DENIAL") — a single-step "click DENY again to confirm" pattern,
   not a modal-within-modal.
8. A contextual note line (varies by kind — HANDOFF explicitly states "Merging
   the PR is never offered here," matching Law 3).
9. Footer action bar (3 buttons, mono 11/0.14em): **OPEN SESSION** (secondary,
   `flex:1`, navigates to `org/agent/<agentId>` and closes the sheet — i.e. "go
   watch/steer the live session" is offered as an alternative to a blind
   decision); **DENY** (secondary, `flex:1`, shows an error dot + `DENY` /
   `CONFIRM DENY` two-step label); **APPROVE/SEND REPLY** (primary, `flex:1.4`,
   bg `--ink`).

Escape key closes both the sheet and the palette globally (shared `onKey`
handler). Clicking the scrim closes; clicking inside the panel
(`stop = e => e.stopPropagation()`) does not.

### 1.8 Theme switching

Default **light**, persisted in `localStorage['zb-dash-theme']`. The control
itself lives **outside my scoped files**, in `System Screens.dc.html` →
`system/settings` → THEME group → a `SegmentedControl`-style `LIGHT / DARK`
toggle (calls `props.setTheme`, which is `App.dc.html`'s `setTheme` state
setter). The App shell owns the actual mechanism: a `THEMES` map of the two
full CSS-custom-property sets (§2.4 of the Design System doc, reproduced
verbatim in both `App.dc.html` and `Dashboard.dc.html`'s component scripts —
**duplicated, not shared**, a maintenance risk noted already for the real DS's
`Theme`/`@theme` duplication problem in `01-design-system.md`), applied via
direct `el.style.setProperty` on the root ref every render (`applyTheme()`),
plus `document.body.style.background` kept in sync so there's no flash outside
the root div. No `prefers-color-scheme` auto-detection — purely a manual,
persisted toggle. No context-based (home/work) accent switch exists in this
design at all — the entire palette is neutral + the 6 status hues, full stop.

### 1.9 Keyboard shortcuts (global, `App.dc.html`'s `onKey` listener)

| Key | Effect |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette (from anywhere) |
| `Escape` | Close palette AND close approval sheet (whichever is open) |
| `↑` / `↓` (palette open) | Move palette selection |
| `Enter` (palette open) | Open selected palette item |
| `Enter` (COO dock input) | Send message |
| `Enter` (agent session input, dept chat input) | Send |

No vim-style/mnemonic shortcuts (no `g o`, no `a` to approve, etc.), no
shortcut to jump sections, no shortcut to approve/deny from the rail without a
mouse click.

### 1.10 Route scheme

Hash-based, no server routing shown (`location.hash`), persisted to
`localStorage['zc-route']`, default `org/map`. Format: `<section>/<subpage>
[/<id> [/<tab-or-subid>]]`.

| Route | Screen |
|---|---|
| `org/map` | Org map (home) |
| `org/pool` | Agent pool |
| `org/agent/<agentId>` | Agent profile |
| `org/dept/<deptId>/<tab>` | Department detail, `tab ∈ {team, subtasks, pipelines, skills, integrations, automations, hooks}` (default `team`) |
| `org/chat/<deptId>` | Department direct line |
| `work/tasks`, `work/chains`, `work/goals`, `work/companies`, `work/projects` | (out of scope — Work Screens) |
| `work/new`, `work/new/<deptId>` | New task form, optional dept-prefill (out of scope) |
| `work/task/<taskId>` | Task detail (out of scope, heavily cross-linked from Org screens) |
| `work/companies/<companyId>` | Company detail (out of scope) |
| `activity/log`, `activity/runs`, `activity/inbox`, `activity/briefings` | out of scope |
| `policy/approvals`, `policy/gates`, `policy/patterns` | out of scope |
| `knowledge/vault`, `knowledge/distill` | out of scope |
| `ledger/budgets`, `ledger/spend` | out of scope |
| `system/settings`, `system/registries` | out of scope, but theme toggle lives here |

Every list→detail transition in Org Screens is a route push via the shared `go`
callback passed down as a prop (`go="{{ go }}"` on every `dc-import`) — no
sub-router owns its own history; `App.dc.html` is the single source of route
state for the whole app, matching the "One interaction grammar" DNA principle
(card-click → detail-route) already used in the real app.

---

## 2. Screen-by-screen catalogue (ORG section + shell chrome)

### 2.1 Org map — `org/map` (default landing)

Top→bottom:
1. Page header: `01 — ORG MAP` (mono 11, `--ink3`) + `ZibbyCorp` (h1, 32/500) +
   right-aligned meta `11 DEPARTMENTS · NN AGENTS IN POOL`.
2. **COO root node**, centered: bordered `--line2`/bg `--panel` pill with 4
   corner-bracket ticks (8px), 50×50 `PixelGlyph` tile (bg `--panel2`) +
   `COO · ROOT` / `Zibby` (16/500) / `Routes, classifies, chats` stacked, plus a
   trailing live-status readout (`workDot` + `NN TASKS ROUTED`, counting tasks
   whose overall state ≠ done via `ZC.taskState`).
3. A single 22px vertical connector stem down to…
4. **11-column department strip** (`grid-template-columns:repeat(11,1fr)`, gap
   8px), a thin horizontal `--line2` rule spanning the row simulates an org-chart
   trunk. Each **Org node** (department card, min-height 128px):
   - Row: dept code (`DEV`) left, `NN SUB` (open-subtask count) right (mono 10,
     `--ink3`).
   - Name (13/500).
   - **Cell strip**: one 9px `StatusDot` per agent currently borrowed by this
     department (empty when none borrowed — `min-height:9px` reserves the row).
   - Bottom, above a `--line` divider: an **alert line** — dot + label, derived
     by priority: any `error` agent → `NN ERROR`; else any `blocked` → `NN
     BLOCKED`; else any `working/thinking` → `NN ACTIVE`; else `QUEUED` (has
     queued subtasks) or `QUIET`.
   - Selected department (click sets `selDept` state, no navigation) gets an
     `--ink` border + a solid connector stub below it; others get `--line` (or
     `--line2` if in a "bad" alert state) and a transparent stub.
   - Card click **does not navigate** — it only updates the focus panel below
     (#5). Reaching the full detail route requires the focus panel's explicit
     **OPEN DEPARTMENT →** button.
5. **Focus panel** (bordered `--ink`, the selected department's live snapshot):
   header row = `02 — DEPARTMENT · <CODE>` + name (18/500) + right-aligned `NN
   BORROWED / NN ACTIVE / NN BLOCKED` counts + `OPEN DEPARTMENT →` button. Body
   is a 2-column split (`minmax(0,1fr) 340px`, min-height 300px):
   - **Left: borrowed-agent grid** (`repeat(auto-fill,minmax(180px,1fr))`, gap
     10) — compact agent cards: 72px glyph tile (on the 8px micro-grid
     background), name+id row, `role · task-or-"Heartbeat"`, state dot+label,
     a 2-line-clamped "now" description. Click → `org/agent/<id>`. Empty state:
     dashed border, "No agents borrowed right now. The department borrows from
     the pool when a subtask starts."
   - **Right: HANDOFFS · IN / OUT panel** (`border-left`) — a live list of every
     in-flight task whose current step touches this department, one row per
     handoff: `IN`/`OUT` direction tag, from-dept chip → animated connector
     (a `zc-flowx`-animated 4px dot travels the line only while the transfer is
     "live," i.e. state is working/thinking) → to-dept chip (with a state dot),
     gate mode (`AUTO`/`ASK`, resolved from `ZC.handoffRules`, or `—` for the
     COO-origin case), task title (single-line ellipsis), and a
     `<taskId> · <ARTIFACT-OR-EM-DASH>` meta line. Click → `work/task/<id>`.
     Empty state: "Nothing moving in or out of this department."

### 2.2 Department detail — `org/dept/<id>/<tab>`

1. Header: `DEPARTMENT · <CODE> · REPORTS TO COO` (mono 11, `--ink3`) + name
   (h1, 32/500) + description (14, `--ink2`), right-aligned action pair:
   **DIRECT LINE →** (secondary, → `org/chat/<id>`) and **NEW TASK HERE**
   (primary, → `work/new/<id>`, i.e. pre-fills this department as the task's
   forced entry point).
2. **4-column metric strip** (`border-top`/`border-bottom` `--line`): `OPEN
   SUBTASKS`, `BORROWED AGENTS`, `RUNS TODAY` (as `used/cap` from
   `ZC.deptBudget`), `SPEND TODAY` (`$` from `ZC.spend.byDept`).
3. **7-tab bar** (mono 11/0.14em, count badge per tab in `--ink3`): **TEAM**
   (borrowed-now count) · **SUBTASKS** (open+closed count) · **PIPELINES**
   (pipeline-definition count) · **SKILLS** (bound-count) · **INTEGRATIONS**
   (bound-MCP-server count) · **AUTOMATIONS** (dept-scoped automation count) ·
   **HOOKS** (registry hook count — always global count, not a bound subset).
   This is the literal IA §04 spec: "Department detail — tabs: Team ·
   Subtasks · Pipelines · Skills · Integrations · Automations · Hooks."

   - **TEAM tab**: `BORROWED NOW · NN` label, then the same agent-card grid as
     the org-map focus panel (48px glyph, name/id, role+task, state, "now"
     text — no 2-line clamp here, so cards can grow taller) — plus a lower
     **"ROLES THIS DEPARTMENT BORROWS"** table (`ROLE / IN POOL / FREE NOW`
     columns): one row per distinct role used by this department's pipelines,
     total headcount owning that role across the whole pool, and how many are
     currently unassigned (`!a.dept`) with a live/idle dot. This is the
     closest thing in the design to a capacity/availability view.
   - **SUBTASKS tab**: a table (`SUBTASK / PARENT TASK / PIPELINE / STEP /
     STATE / AGENTS` columns), one row per subtask this department owns across
     all tasks (`ZC.subtasksOf`), state shown as dot+label (idle→"QUEUED"
     display override), an `AGENTS` cell showing tiny 18px glyphs (no glow) of
     whichever agents are currently working that specific subtask. Row click →
     `work/task/<parentTaskId>`. Empty: "No subtasks in this department."
   - **PIPELINES tab**: one card per pipeline definition owned by this
     department (`ZC.pipelines[deptId]`), each showing: name (mono 11/600) +
     step-count + right-aligned `USED BY · <comma-joined chain names that
     route through this dept>`; a horizontal step chain (`bordered chip → chip
     → …`, `⇄` between two steps flagged as a rework loop in that pipeline's
     `loops` array, `→` otherwise); a note line explaining the rework-loop
     bound ("3 retries before it escalates to NEEDS YOU… each subtask runs in
     its own git worktree") or "Linear pipeline, no rework loop." for loop-free
     pipelines.
   - **SKILLS / INTEGRATIONS / AUTOMATIONS / HOOKS tabs** all render through
     one shared **generic bound-registry list** component (`tab.list`): a note
     line + a bordered table, each row = `NAME (mono 12) / DESC (13, --ink2) /
     META (mono 10, --ink3 — registry status for skills&mcp, "NEXT · <time>"
     for automations, event name for hooks) / a right-aligned toggle group`.
     The toggle group is a 2-or-3-state `SegmentedControl` per row:
     - Skills/Integrations: **BOUND / OFF** (2-state, purely local
       `this.state.toggles` — no persistence, no backend call in the mock).
     - Automations: **ON / OFF**.
     - Hooks: **INHERIT / ON / OFF** (3-state — the only tab whose default
       state is "inherit from the global hook," matching the IA's "global
       hooks apply everywhere; override per department" framing) — hooks list
       itself has **no department-scoping data in `ZC.registries.hooks`** (its
       4th tuple field is a dept-id array like skills/mcp have, but the row
       renderer for Hooks ignores it and always seeds every row at
       `INHERIT`).

### 2.3 Agent pool — `org/pool`

1. Header: `AGENT POOL` label + `Shared roster` (h1) + explainer sentence
   ("Departments borrow agents per subtask and return them when it ends.").
2. **Filter chip row**: `ALL` + one chip per state (`working/thinking/blocked/
   error/done/idle`), each showing a dot (except ALL) + label + count; selected
   chip gets `--panel2` bg + `--ink` border/text.
3. **Card grid** (`repeat(auto-fill,minmax(220px,1fr))`, gap 10): each card is
   `grid-template-columns:56px minmax(0,1fr)` — 56px glyph tile (glow) at left,
   right column stacked: name/id row, role, state dot+label, and a **WHERE**
   footer line (`border-top` divider) reading either `BORROWED · <CODE> ·
   <task-or-"HEARTBEAT">` or `IN POOL · AVAILABLE`. Click → `org/agent/<id>`.
   No pagination, no sort control beyond the state filter, no search box on
   this screen (search-by-agent lives only in the global ⌘K palette).

### 2.4 Agent profile — `org/agent/<id>`

2-column layout (`minmax(0,1fr) minmax(0,1.1fr)`, `align-items:start`):

**Left column:**
1. **Hero glyph tile**: 220px tall, bordered `--line2`, 12px micro-grid bg, 4
   corner-bracket ticks, the agent's 128px glyph centered (glow), a bottom-left
   caption `<id> · SHARED POOL`.
2. Name row: h1 (30/500) + a bordered state badge (dot + label, `--line2`
   border) — badge shows `PAUSED` when the local pause toggle is on, overriding
   the underlying state color/label.
3. `<role> · <where>` meta line (`Borrowed by <Dept Name>` or `In pool`).
4. **CURRENT SUBTASK card**: label + subtask-id meta (top row), the subtask's
   free-text "now" description (15px), a 2px progress bar (fill `--ink`, width
   = a *deterministically pseudo-random* percentage seeded from the agent name
   — not a real progress source), a `STEP N/M` / `pct%` meta row, and — only
   if the agent has an active task — an **OPEN <TASK-ID> →** link.
5. **TOOLS · NN** — a wrapped chip row of the agent's role-specific tool
   identifiers (`ZC.tools(agent)`, e.g. Coder → `repo.read, repo.write, shell,
   git.push, pr.open`). Static per-role list, not per-instance.
6. **3-column metric strip**: `SUBTASKS · 7D`, `SUCCESS` (%), `SPEND · 24H`
   ($) — all pseudo-randomly generated from the agent's name hash, not sourced
   from any real run history in the mock.
7. **HISTORY list**: up to 4 rows, `grid-template-columns:90px 50px minmax(0,1fr)
   60px` = subtask-id / dept-code / description / relative-time. First row is
   always the agent's live "now" state; the remaining 3 are **hardcoded demo
   rows** (`TSK-0141.1`, `TSK-0137.1`, `TSK-0133.2` — identical for every
   agent, not derived from that agent's actual run history).

**Right column: SESSION panel** (bordered `--ink`, min-height 640px — this is
functionally the live-transcript/log view):
1. Header: `SESSION` label + a synthetic session id (`SES-NNNN`, hash-derived)
   + right-aligned state readout (dot + `LIVE` / `PAUSED` / `NO ACTIVE
   SESSION`).
2. **Log body** (bg `--bg`, `flex:1`): up to ~9 **Log lines** (mono 11/1.4,
   timestamp in `--ink3`, text in `--ink2` except the newest line which is
   `--ink` + a blinking block caret). Sourced from: the agent's associated
   `ZC.runs` entry's `events[]` (reversed, most-recent-first) if one exists,
   else a synthetic one-liner from `a.now`; a static "Session started ·
   grounded with N vault notes" line is always appended at the bottom
   (hash-seeded N); plus any operator messages sent in this session
   (`this.state.sess`, prefixed `CEO → `) prepended live, **each followed by a
   scripted "Acknowledged. Adding to context for the current step." reply** —
   i.e. the mock always echoes one fixed acknowledgment, no real agent
   response generation.
3. Composer row: text input (placeholder `Message <name> in this session`,
   Enter sends) + **PAUSE/RESUME** toggle button (local-only state, does not
   actually stop any run in the mock) + **SEND** button.

### 2.5 Department direct line (chat) — `org/chat/<id>`

2-column layout (`minmax(0,1.6fr) minmax(0,1fr)`):

**Left: chat panel** (bordered `--ink`, min-height 640px) — same visual
grammar as the COO dock's expanded chat, but department-scoped: header =
`DIRECT LINE · <CODE>` + name (18/500) + right-aligned **DEPARTMENT →** button
(back to `org/dept/<id>/team`). Message list: You-bubbles right/`--ink` fill,
Dept-bubbles left with a `<CODE> · <NAME>` label line above a bordered bubble.
Seed message is either the department's canned greeting from
`ZC.chat.dept[deptId]` or a generic fallback (`"<Dept> here. <dept.desc> What
do you need?"`). Reply logic (`sendChat`) is a single regex gate: if the
message matches `/task|do|fix|build|write|make|add/i`, the canned reply nudges
the operator toward **NEW TASK HERE** or letting Zibby route it; otherwise it
reports the open-subtask count and promises to "fold this into the current
work and report back in the next briefing." **No real task creation happens
from this chat** — it is explicitly advisory/status-only, distinct from the
COO dock which *does* wire a CREATE TASK action into its own chat bubbles.

**Right: CONTEXT · SUBTASKS panel** — a plain vertical list of this
department's open subtasks (id + state dot/label row, title, `pipeline · step`
meta), each a card that routes to `work/task/<parentId>`; footer note clarifies
scope: "Messages here go straight to the department. Anything that turns into
work becomes a task that enters at this department."

### 2.6 `ZibbyCorp Splash.dc.html` — boot animation (standalone doc, own root)

Fixed 520×360 stage, centered in a full-viewport paper-grid backdrop (identical
light-theme-only token set hardcoded — no theme switch here). A scripted,
looping (or single-play; `loop`/`speed` are exposed as Design Canvas editor
props) ~10.2s timeline entirely driven by `requestAnimationFrame` + manual
easing functions (no CSS animation library):
- **0–2.9s**: wordmark card (`ZIBBYCORP` mono 40/600/0.24em + `AGENT
  OPERATIONS CONSOLE` subtitle + status dot/label) sits static; the Zibby
  glyph (state `idle`) creeps slightly and, 1.2–2.4s, shows a speech-bubble
  aside: "psst. still loading?" — a joke about the boot bar's slow fill.
- **2.9–5s**: glyph state → `thinking`, hops up above the card with a small
  rotation wobble; second aside "…yep. still loading." → "ugh. fine."
- **5–7.7s**: state → `working`, the glyph travels horizontally across almost
  the full stage width with a bobbing/rocking walk-cycle, **visually dragging
  the boot-progress-bar fill along with it** (`push = x + S*.83` directly
  drives the bar's pixel width) — the glyph *is* the loading indicator, not a
  separate element.
- **7.7s+**: state → `done`, settles at the right edge, bar fills to 100%,
  status line switches to `READY · ALL AGENTS ON DUTY`; aside "done. you're
  welcome."
- Progress bar (2px, `--line` track / `--ink` fill) + `BOOT NN%` /
  `CLICK TO REPLAY` caption row beneath the card. Clicking anywhere resets `t`
  to 0 and replays. This is a from-scratch bespoke timeline component, not
  reusable off-the-shelf — closest existing analog in the real app is
  `apps/web/components/layout/BootSplash/BootSplash.tsx` (currently a simple
  crossfade with a floor time, no character choreography) and the
  `LoadingScreen/*` family (`BrandMark`, `BootProgress`, `Wordmark`,
  `StatusLine`, `CircuitTraces`) already flagged in `01-design-system.md` as
  hand-authored/DS-boundary-exempt — this splash would extend that same
  exempt family, not fit inside sealed DS primitives.

### 2.7 `ZibbyCorp Directions.dc.html` — internal design-reference doc

A `design_doc_mode="canvas"` presentation page (not a product screen — a
documentation/pitch artifact for the design itself), light-theme static
background `#D9DAD6`. Contains: a title block ("Blueprint, light & dark"), a
**shared "Agent glyphs" swatch section** showing all 6 states side-by-side in
both light and dark token sets simultaneously (96px glyphs + dot + label +
one-line behavior note per state, e.g. "Bobs, arms type, keys flicker" for
working) plus a 34-agent roster strip (44px glyphs, no glow) under each, and a
**"1a Blueprint" section** that literally iframes-in `Blueprint Screen.dc.html`
twice at fixed 1600×1000px (once with light tokens injected as a wrapper style,
once dark) with a drop-shadow, captioned with the same "hairline 1px rules,
square corners, drafting grid, numbered sections, corner ticks, glow only in
dark" principles that are now the Design System doc's canon. **This file only
demonstrates the legacy Dashboard/Blueprint layout — it has not been updated to
show the current Org Screens content**, so it undersells what the real,
IA-aligned build now looks like; useful only for the glyph-state reference
grid, not as a screen-fidelity source.

---

## 3. Reusable visual component catalogue

For each: what it needs (props/variants) and its DS mapping status. "Restyle"
= an existing DS component can absorb this with prop/variant additions;
"Rewrite" = existing DS component's structure doesn't fit, needs a new
implementation under a similar name; "New" = no DS analog exists at all.

| Component | Variants / props needed | DS mapping |
|---|---|---|
| **PixelGlyph** (agent sprite) | seed (name), state (6: idle/working/thinking/blocked/error/done), size (18/20/22/30/38/40/48/56/128 seen in use), glow (bool, auto-off for idle/size<40), tint via `body`/`eye` colors | 🆕 **New**. Procedurally generated per-seed 8×8 mirrored pixel creature via `steps(1,end)` keyframe families per state (`zb-breathe/bob/arm/blink/key/dot/pulse/shake/hop/twinkle`), `shape-rendering:crispEdges`. Nothing in DS generates art from a seed; closest structural cousin is `Icon`/`IconTile` (closed glyph union, tone-tinted) but those are hand-drawn SVGs, not generative. Needs a wholly new DS component (`AgentGlyph`?) plus ~13 new `@theme` keyframes (already spec'd verbatim in the Design System doc §9) and per-state motion is more elaborate than the existing `StateTone`/`LivingGlow` 5-tone/2-intensity model (this needs 6 *state-specific animations*, not one shared pulse). |
| **StatusDot** (square) | tone (6: work/think/block/err/done/idle — a superset of DS `StateTone`'s 5), size (6–9px), living (breathe for working, blink for blocked, static otherwise) | 🔁 **Restyle, with a gap.** DS `StatusDot` exists (`tone: DotTone`, `pulse`) and is close, but is round (`radiusFull`) — this design mandates **square** (`--dot-r:0`), and needs a distinct **"thinking"** tone that doesn't exist in `StateTone`/`DotTone` today (DS's 5-tone vocabulary is accent/ok/warn/bad/run; this design's 6-tone vocabulary is work/think/block/err/done/idle — closest is `run≈work`, `bad≈err`, but `think` has no DS analog at all and `done`/`idle` as *distinct hues* rather than "just not-live" is new). |
| **StatusPod** (ring + glyph, pulsing) | size, state | ⚠️ **Defined in `zibby.js` (`pod()`) but never called anywhere in either the current build (`ZibbyCorp App.dc.html`, `Org Screens.dc.html`) or the legacy one** — dead code in the shared helper, evidently superseded by plain glyph+dot combos everywhere it might have been used. Do not implement unless a not-yet-seen screen (Work/Activity/Policy/Knowledge/Ledger — out of my scope) actually calls it. |
| **Cell strip** | array of tone dots, 9px, wrap | 🆕 New composition — trivial once `StatusDot` exists (just a flex-wrap row), no DS list-of-dots primitive today. |
| **Corner brackets** | inset (8/10px), color `--ink`, 4 independently-positioned L-marks | 🔁 Maps directly onto DS's existing `Corners` component (already used by `Card`/`Panel`/`LivingGlow`, `CornersTone`=`StateTone`) — needs a square/0-radius mode and possibly a size variant (8/10px insets seen here vs. whatever `Corners`' current `inset` scale offers); largely a restyle, not new. |
| **Org node** (department card on the map) | code, name, cell-strip, alert line (dot+label), selected/alert border states | 🆕🔁 New composite (nothing in DS is an "org-chart node"), but composes cleanly from `Card`/`Corners`/`StatusDot`/`Chip`-like parts already in DS — a domain composite (`apps/web/features/…`), not a DS primitive, matching the "department/employee has no visual home yet" gap flagged in `01-design-system.md`. |
| **Approval card** | glyph, name, id/dept meta, wait time, request text, task-ref line, 3-button action row (primary/secondary/icon) | 🔁 Composable today from `Card`+`Button`(intent variants)+`Icon` — no new DS primitive strictly required, but the *one-click-approve-no-confirm* interaction (§1.3) conflicts with the existing `HoldButton` pattern used for high-risk approvals in the real app; needs an explicit product decision on whether quick-approve bypasses hold-to-confirm or not (flag in §5). |
| **Inspector / hero profile layout** (glyph hero + state badge + current-task card + metric strip + tool chips + log + composer) | — | 🔁 **Very close to today's `EntityHero` + `HudPanel` + `Stat`/metric-strip + `CodeBlock`/log pattern** already used across `/agents/[id]` and similar detail screens — largely a restyle of existing detail-page composition, not new component classes. The **live SESSION log + inline composer** sub-panel is closer to `apps/web/features/chat`'s `ChatDock`/log components than anything in DS proper. |
| **Metric strip** (N equal columns, label+value, top/bottom hairline) | 3-col and 4-col variants seen | 🔁 Maps to DS `Stat` repeated in a `Grid`/`Row` — no dedicated "strip" component exists, but is trivially composed; if this pattern recurs as often as it does here (approval sheet, agent profile, department header — 3 places already, all 3-or-4-col) it's worth promoting to its own DS composite (`MetricStrip`) rather than re-deriving the grid+border each time. |
| **Log line** (mono, timestamp + text + blinking caret on newest) | — | 🔁 DS has no dedicated "log line" component; closest is `CodeBlock`, which per `01-design-system.md` "drops run-log folding" already (a flagged gap) — this pattern (per-line timestamp/color/caret) is closer to a new small composite than a `CodeBlock` reuse. |
| **Legend** (2-col dot+label+count grid) | — | 🆕 present in the *legacy* Dashboard rail only (not in the current App shell's NEEDS YOU rail, which dropped the state legend entirely) — low priority unless a future screen (Activity/Policy) resurrects it. |
| **Flow / handoff row** (from-chip → animated packet → to-chip, gate label) | direction (in/out), live/idle, gate mode | 🆕 New composite; the "live transfer" affordance (a small dot traveling the connector line while a handoff is active) has no DS equivalent — closest existing analog in the real app is the immersive layer's `HandoffFlare`/`ConnectorLayer` (comet+burst SVG animation between orbs), but that's WebGL/orbit-map coded, not a flat hairline-chip connector; this is a much simpler flat-2D reimplementation of the same *concept* (live handoff between two nodes), not a reuse of the existing WebGL component. |
| **Pipeline step chips** (bordered chip row, `→`/`⇄` between, rework-loop note) | — | 🆕 New; loosely resembles `ButtonGroup`/`Chip` but the `⇄` rework-loop connector and per-step numbering is domain-specific — a `apps/web/features/pipelines` composite is the closer analog (the real app already has a node-graph `PipelineCanvas` editor for this exact concept, far more elaborate than this flat linear-chip rendering — worth deciding whether the department-detail Pipelines tab reuses a simplified read-only `PipelineCanvas` view or gets this flatter chip-row instead). |
| **Bound-registry list row** (name/desc/meta + 2–3-state segmented toggle) | 2-state (BOUND/OFF, ON/OFF) and 3-state (INHERIT/ON/OFF) | 🔁 Maps to DS `List`/`ListItem` + `ButtonGroup` (segmented) — straightforward composition, no new primitive. |
| **Command palette** | grouped/kind-tagged flat list, keyboard nav | 🔁 **Very close to the existing `apps/web/features/chat/components/ChatSearch.tsx`** (⌘K inline top search) already documented in `02-web-routes.md` — same interaction shape, broader index (§1.6). This is a restyle/re-scope of `ChatSearch`, not new, though its **positioning** differs (this design floats it as a centered top overlay dialog à la classic Spotlight/Linear, vs. today's `ChatSearch` living inline in the top bar and expanding downward — a layout decision, not just data). |
| **Approval sheet** | right-side drawer, diff viewer, task-chain chip row, metric strip, 3-button footer | 🔁 Composable from DS `Dialog`/`FloatingPanel` (side-drawer variant) + `CodeBlock`(diff mode)+`Stat` strip + `Button`; no dedicated "approval sheet" DS component exists today (the real app currently has **no standalone approval detail page at all** — approvals only surface inline in the chat task gutter / `StatusFlyoutPanel`, per `02-web-routes.md` §5/§8.6 — so this whole sheet is net-new UI, even though its parts are DS-composable). |
| **COO dock** (floating chat composer, collapsed/expanded) | — | 🔁 Near-direct parallel to the current app's `ChatDock`/`ChatBottomBar` (`apps/web/features/chat`), but **floating and per-page** here vs. the current app's dock being specific to the `/chat` home route only — this design wants the COO dock available from *every* screen (it lives in the shell, not a route), a bigger structural change than a restyle. |
| **Department chat panel** | — | 🆕 New relative to today's app — no per-subsystem chat surface exists currently (`SubsystemDrawer` has no chat tab; chat is global-only, routed to `/chat`). |
| **Blueprint-doc presentation chrome** (`ZibbyCorp Directions.dc.html`) | — | N/A — internal design-reference artifact only, not a product screen; no implementation action needed. |

---

## 4. Mapping table — design screen → current route/component/API

Legend: ✅ exists (re-skin) · 🔁 exists but must move/restructure · 🆕 not
implemented, frontend-only · 🆕🔌 not implemented, needs backend/contract work ·
❓ needs an operator decision.

| Design screen/element | Current equivalent | Status |
|---|---|---|
| Header top nav (ORG/WORK/ACTIVITY/POLICY/KNOWLEDGE/LEDGER) | No equivalent — today's only persistent nav is `ChatToolDock`'s 12-icon rail (`apps/web/state/config.ts` `NAV_ITEMS`), a flat list not grouped into sections | 🆕 New nav taxonomy; today's 12 domains (companies/teams/projects/agents/pipelines/skills/commands/mcp/hooks/signals/automations/memory) need remapping onto 6 sections + department-scoped sub-tabs (§4 continues this mapping per legacy-migration table below) |
| Header spend gauge (5H/WEEK) | `LimitsRings` (`apps/web/components/layout/LimitsRings/`) — same data (`useLimitsQuery`, 5h/weekly Claude usage window), different visual (rings vs. bars) | ✅ Exists, re-skin only |
| Header ⌘K search trigger + palette | `ChatSearch` (`apps/web/features/chat/components/ChatSearch.tsx`) | 🔁 Exists, needs re-scope (broader index, different overlay position — §3) |
| ⚙ Settings icon → SYSTEM | `/settings` route, reached via `ChatToolDock`'s Settings item today | ✅ Exists (route target), 🔁 entry point moves from dock icon to header ⚙ |
| NEEDS YOU rail | No standalone rail exists today — closest is `StatusFlyoutPanel`'s pending-approvals section (hover/click flyout off `StatusPill`) and the `/chat` task gutter's inline approvals | 🆕 New persistent rail; today's approval surfacing is a flyout, not an always-visible panel — a real UX shift, not a re-skin |
| Approval card quick-approve/deny | `RunApprovalGate`/inline approve in chat task gutter, `useApprovalsQuery`/approve-reject mutations already exist per `03-backend-domain.md` §1 (`POST /approvals/:id/approve|reject`) | ✅ API exists; 🔁 UI surface moves into the new rail |
| Approval sheet (full detail drawer) | **No standalone approval detail page exists today** (§3 above) | 🆕 New screen, though its data (rule, diff/artifact, task chain, metrics) is all already modeled server-side (`ApprovalSchema`, `GateRule`, task chain via `subs`) |
| COO dock (global floating chat) | `/chat` route's `ChatDock`/`ChatBottomBar`, but scoped to the `/chat` home screen only | 🔁 Needs to become shell-global (every route), not route-scoped — structural change |
| `org/map` (Org map, COO + 11 department nodes) | Closest is `/chat`'s `SubsystemOrbMap` (11 subsystem orbs + core orb, WebGL) | 🔁 Same concept, entirely different rendering technology (flat hairline cards here vs. WebGL orbit map today) — `01-design-system.md` already flags the orb-map as "the single largest cannot-just-retheme risk" |
| Org map's per-department focus panel (borrowed team + handoffs) | `SubsystemDrawer`'s Roster tab (agents) + no equivalent for the live in/out handoff list | 🔁 Roster half exists (`GET /subsystems/:id/roster`); 🆕🔌 the "handoffs in/out, live" half has no query today — would need a live view over `HandoffSignal`/`HandoffOutcome` + in-flight task subs, not currently exposed as its own endpoint |
| `org/dept/:id` — header + 4 metrics + REPORTS TO COO | `SubsystemDrawer` modal (not a routed page — opens over `/chat`) | 🔁 Needs promotion from a modal to a first-class route; `SubsystemWithStatusSchema` has `tier2Count/tier3Count/errorCount`, not the `OPEN SUBTASKS / BORROWED AGENTS / RUNS TODAY / SPEND TODAY` metrics shown here — see §6 |
| `org/dept/:id/team` | `SubsystemDrawer` → Roster tab | ✅ Close match, needs route promotion + "ROLES THIS DEPARTMENT BORROWS" capacity table is 🆕🔌 (no per-role pool-availability query exists) |
| `org/dept/:id/subtasks` | No per-subsystem subtask/task list exists (tasks aren't modeled as having per-department "subtasks" at all today — see §6) | 🆕🔌 |
| `org/dept/:id/pipelines` | `SubsystemDrawer` doesn't have a pipelines tab (per `02-web-routes.md`, "Pipelines are NOT in the roster shape — the web roster tab sources those client-side from the pipeline canvas") | 🆕 Frontend-only if scoped as "pipelines where `ownerSubsystem === this dept`" (data already exists via `GET /pipelines` + filter); 🔁 if it should reuse `PipelineCanvas` instead of flat chips (design decision) |
| `org/dept/:id/skills`, `/integrations`, `/automations`, `/hooks` (bind/override toggles) | Skills/MCP/Automations/Hooks all exist as **global catalogs** today (`/skills`, `/mcp`, `/automations`, `/hooks`) with **no per-subsystem binding concept** at all | 🆕🔌 Needs new backend relations: which skills/MCP servers/automations/hooks are "bound" to which subsystem — none of `SkillSchema`/`McpServerSchema`/`AutomationEventSchema`/`HookSchema` carry an `ownerSubsystem`-like field today (only Agent/Pipeline do) |
| `org/pool` (Agent pool, filter by state) | `/agents` catalog screen (categorized, not state-filtered) | 🔁 Exists, needs a state-filter chip row added and category-grouping possibly dropped/changed to state-grouping |
| `org/agent/:id` (hero + current subtask + tools + metrics + history + live session log) | `/agents/[id]` DetailScreen (basics + gate rules editor only — no live "current task"/session/log view) | 🔁 Route exists; the *live activity* half (current subtask, progress, session log, pause/resume, message-in-session) is **entirely new** relative to today's static agent-config screen — closer in spirit to a run-detail view (`RunDetail`, per-run log streaming already exists via SSE, `GET /api/tasks/runs/:runId/logs/stream`) than to the agent config screen; likely needs to become a **live composite of agent config + its current run's log stream**, not a re-skin of either alone |
| `org/agent/:id` PAUSE/RESUME | No agent-level pause exists today — only run-level stop/resume (`useRunActions`, task-runs stop/resume endpoints) | 🔌 Adjacent — "pause this agent" vs. "stop this run" are different scopes; needs a decision on which the design means |
| `org/chat/:id` (department direct line) | No per-subsystem chat surface exists (chat is global `/chat` only) | 🆕🔌 New concept — would need either a new chat-scoping mechanism (subsystem-tagged transcript) or a client-side filter/prefix over the existing global chat |
| `+ NEW TASK` (subnav, global) | `NewTaskProvider`/`CommandLine` task composer, already app-wide per `02-web-routes.md` §3 | ✅ Exists, re-skin/re-position only |
| Command palette results across pages/depts/agents/companies/tasks/commands | `ChatSearch`'s 12-kind index (agents, pipelines, subsystems, tasks, memory, skills, mcp, projects, commands, companies, settings, action) | 🔁 Overlapping but not identical kind-set; needs reconciliation (design's index skips memory/mcp/projects as first-class kinds but adds raw department+role labels into agent entries) |
| Theme toggle (Settings → Appearance) | DS `theme="dark"` hardcoded in `apps/web/app/providers.tsx`; **no light theme exists in practice** (`lightTheme.ts` is an explicit stub per `01-design-system.md`) | 🆕🔌 Real gap — this design's *default* theme is light, the opposite of today's dark-only reality; light theme needs full design work, not a flip of a flag |
| `ZibbyCorp Splash.dc.html` boot animation | `BootSplash` (crossfade only, no character) | 🔁 Exists as a concept/slot; the choreographed glyph-walk timeline is net-new bespoke motion work, same DS-boundary-exempt category as `LoadingScreen/*` |

### Legacy-segment migration (from `Information Architecture.dc.html` §05, cross-checked against `02-web-routes.md`'s actual route list)

| Today's route | ZibbyCorp location (per IA) | Confirms/contradicts current code? |
|---|---|---|
| `/` → `/chat` (overview/home) | `ORG → Org map (home)` | Consistent — both are "home" |
| `/agents(+[id])` | `ORG → Agent pool + Agent profile` | Consistent |
| `/pipelines` | `ORG → Department detail → Pipelines tab` | **Structural move** — pipelines stop being a top-level catalog and become department-scoped; the standalone `/pipelines` master-detail screen (today's one architectural outlier per `02-web-routes.md` §8.7) would be retired or become a filtered redirect |
| `/automations` | `ORG → Department detail → Automations tab` (system automations already live in Settings today, unaffected) | Structural move, same direction as pipelines |
| `/signals` (handoff signal-kind registry) | Not explicitly placed in the IA sitemap — implied to live inside `POLICY → Gate rules (incl. handoff rules)` | ❓ Needs an explicit decision — signal *kinds* (the registry) vs. handoff *rules* (the routing) are two different current screens (`/signals` vs. `SubsystemDrawer` Handoff tab) that the IA doesn't clearly separate |
| `/teams`, `/companies` | `WORK → Companies` (only "Companies" listed; **Teams has no separate IA sitemap entry**) | ❓ Needs a decision — does Team get folded into Company, dropped, or just omitted from the IA doc by oversight? (Out of my scope to resolve — flag for whoever owns Work Screens.) |

---

## 5. Implemented today, absent from this design — flag for a decision

| Today's feature | Where | Suggested new home / disposition |
|---|---|---|
| **`SubsystemOrbMap`/`OrbMap`/`Orb`/`OrbNode`/`CoreOrb`/`ConnectorLayer`/`HandoffFlare`** (WebGL orbit visualization) | `/chat` home | This design's flat `org/map` department strip is a full replacement, not a variant — ❓ decide whether the WebGL orb map is retired outright (matches this design's whole "instrument paper, no glow in light mode" aesthetic, which is fundamentally incompatible with a 3D wireframe sphere scene) or kept as an alternate "immersive" view behind a toggle. Given the Design System doc's explicit "no drop shadows, no gradients, no glow in light theme" principles, keeping both seems like two irreconcilable visual languages coexisting — recommend a clear pick. |
| **`LimitsRings`** | `ChatTopBar` | Maps near-1:1 to the header's 5H/WEEK bars (§4) — low-risk, just restyle rings→bars. |
| **`LangSwitch`** (cs/en toggle) | `ChatTopBar` | No equivalent anywhere in scoped files — ❓ decide where locale switching lives (System Screens/Settings is the obvious candidate, alongside the THEME segmented control, but wasn't visible in my scope — check with whoever owns System Screens). |
| **`BootSplash`** | `app/providers.tsx` | Direct analog exists (`ZibbyCorp Splash.dc.html`) — implement the choreographed version, not a re-skin of the crossfade. |
| **Status-pill hover/click flyout (`StatusFlyoutPanel`)** | `ChatTopBar` | Superseded by the always-visible NEEDS YOU rail (which shows more, always, without a hover gesture) — recommend retiring the flyout pattern entirely rather than keeping both. |
| **`ChatLiveLog`** (bottom-right collapsible activity feed) | `/chat` | Overlaps with `ACTIVITY → Live log` (IA §04) — ❓ decide whether a persistent mini version stays docked somewhere in the new shell (this design's shell has no equivalent floating log — only the COO dock occupies that corner) or whether Live Log becomes purely a routed page. |
| **Quick note / voice-mode details (mic amplitude viz, echo guard, settle-reason player)** | `/chat` composer | This design's COO dock VOICE button is a much simpler mock (canned 1.6s "recognition" delay, no real waveform) — ❓ decide whether the real STT/TTS pipeline (`useSpeechRecognition`, `useSpeech`, phase 17–25 voice arc) gets kept wired to this simpler visual, or whether voice UX gets redesigned too (out of scope for this file set — check Work/Activity Screens for any richer voice treatment). |
| **`SubsystemDrawer` tabs: gates, handoff, artefakty** | `/chat`, modal | Design's `org/dept/:id` has **7 tabs** (team/subtasks/pipelines/skills/integrations/automations/hooks) — **no "gates" tab and no "artefakty" (artifacts) tab**, and "handoff" is implicit (shown as the org-map focus panel's IN/OUT list, not a department-detail tab). ❓ Decide: do per-department gate rules move into `POLICY → Gate rules` exclusively (IA implies this — "fixed floor + per-project rules, incl. handoff rules"), and do artifacts move into `WORK → Task detail` exclusively (artifacts are per-subtask outputs, already shown inline in the Subtasks tab's `produces` field and the handoff `ARTIFACT` meta) — i.e. this may be an intentional consolidation, not an oversight, but it should be confirmed explicitly since it removes two tabs users rely on today. |
| **Pins (`PinButton`, favorite an agent/pipeline)** | `/agents/[id]`, `/pipelines` | No equivalent anywhere in scoped files. ❓ Low-stakes — likely just needs a small UI slot decision (e.g. a star icon on agent-pool/department-team cards) if kept at all. |
| **`ChatSearch`'s omission of teams/automations/hooks/signals** (`02-web-routes.md` §8.3, a pre-existing inconsistency) | `/chat` | This design's palette *does* index departments, agents, and commands (broader than today) but I did not see automations/hooks/signals as their own palette `kind` either (they're reachable only via department tabs / registries) — the same class of gap persists in the new design, just reshuffled; worth fixing here rather than carrying it forward again. |

---

## 6. Data the design needs that the backend does not provide

Cross-referenced against `03-backend-domain.md` §1/§2/§7 (already a thorough
gap analysis for the company metaphor generally — this section adds the
*specific* fields this design's Org screens actually render, citing exact
contract fields that exist vs. are missing).

| Design data point | Backend field that exists | Gap |
|---|---|---|
| Corporate department code/name/tagline (`DEV`/"Development"/…) shown instead of `forge`/"Forge" | `SubsystemSchema.id/name/tagline/mandate/color` (mythic names) | The IA is explicit that "old mythological names stay in code" — so this is a **pure display-layer mapping** (`subsystemId → corporate code/name`), not a schema change, *if* the mapping table itself can live in the frontend as a static constant. If the redesign wants the corporate name server-driven (e.g. so briefings/notifications also use it), it becomes a 🆕🔌 `displayName`/`displayCode` field on `SubsystemSchema`. ❓ decision either way — flagged, not assumed. |
| Agent **human first name** as primary identity (Kevin, Stuart, Otto…) | `AgentSchema.name` | Today's real agents are named by function (`architect`, `fullstack-developer`, `code-reviewer`, `test-automator`, `documentation-engineer`) — **not** human first names. This is a real content/identity decision, not just a UI label: either (a) rename actual agent records to human names (breaking every place `agent.id`/`name` is referenced as a technical slug), or (b) add a separate cosmetic `displayName` field distinct from the technical `id`/`name`. ❓ |
| Agent **role/job-title** distinct from category (`Architect`,`Coder`,`Reviewer`,`Tester`,`Documenter`,`Researcher`,…) | `AgentSchema.category` (free text), `description` | No structured `role`/`title` field — already flagged as backend gap #3 in `03-backend-domain.md` ("Employee profile beyond avatar/glyph/description. No title..."). This design's role taxonomy (19 distinct role strings) is exactly the shape such a field would need to hold. 🆕🔌 |
| Agent **state**: idle / working / thinking / blocked / error / done (6 values) | `RunStatusSchema`: running/done/error/interrupted/awaiting-approval/paused-limit | **No direct match.** `thinking` has no backend concept at all (would need to be inferred client-side from "running but not yet emitted a tool call," if even knowable); `blocked` ≈ `awaiting-approval`; `idle` = agent has no active run (derived, not stored); `done` in this design is a *per-agent* momentary state ("just finished, about to go idle") vs. backend's `done` being a *per-run* terminal status. Implementing this needs either a richer run-status enum or a client-side state machine layered over the existing one. 🆕🔌 |
| **"Borrowed by department"** — an agent's *current, transient* department assignment | `Agent.ownerSubsystem` | **Fundamental model mismatch, the single biggest gap in this whole file set.** `ownerSubsystem` is a *static, admin-time* FK ("this agent belongs to Forge," set once, rarely changes). This design's "shared pool, departments borrow agents per subtask, return them when it ends" is a *dynamic, runtime* concept — which department (if any) currently has a live `AgentRun` using this agent, for how long, on which subtask. That has to be **derived live from active `AgentRun`/`PipelineRun` phase state** (which pipeline instance is running, what subsystem owns that pipeline), not read off `ownerSubsystem`. Today's `ownerSubsystem` may need to become optional/advisory ("home department" for display grouping in the Pool screen) while "currently borrowed by" becomes a wholly computed, live-only value with no stored field at all. 🆕🔌, and it's the load-bearing decision the whole Org section depends on. |
| **Parent task → per-department subtask** (`TSK-0142.1`, `.2`, `.3` — one subtask id per department the chain passes through) | `TaskSchema`/`TaskTarget` — a task has **one** target (agent/pipeline/goal/subsystem/orchestrator), no sub-task decomposition concept | **No backend concept of a multi-department parent/child task at all.** Today's closest analog is a *pipeline* with phases (all within one subsystem) or *chains* (the now-amputated cross-subsystem feature — per project memory, "full chains amputation" already happened as an explicit removal, `project_subsystem_handoff_arc.md`). This design's "chain across departments, pipeline inside" is **structurally the same shape chains used to be**, now reintroduced under a new name — worth explicitly surfacing to whoever plans this: it is not a net-new concept, it is **un-deleting and redesigning a feature that was deliberately removed**, and the team should know why chains were amputated before reintroducing the same shape. 🆕🔌, high-context-risk. |
| **Chain** (named cross-department route, e.g. `feature: R&D → Development → Release Management`) with per-hop gate mode | `HandoffRule` (from/signalKind/minSeverity/to/tier) — event-driven, not a pre-declared route; no `Chain` entity | Same amputated-chains note as above. `ZC.chains` (9 hardcoded chains: feature/bugfix/hotfix/secpatch/research/announce/sweep/personal/finance) has no backend counterpart at all today. 🆕🔌 |
| **Department budget** (`ZC.deptBudget`: per-department daily run cap/used) shown in the department header metric strip | `Budget` domain — global + **per-project** caps only, no per-subsystem allocation | 🆕🔌 New aggregation dimension; would need either a new per-subsystem budget config or a derived rollup (sum of project budgets for projects whose active work currently routes through that subsystem — ambiguous, since subsystems aren't project-scoped). ❓ decision on aggregation method. |
| **Department spend-today** (`$` in the metric strip) | `Budget`/ledger tracks spend per-project and globally, not per-subsystem | Same gap as above — 🆕🔌, needs a subsystem-dimension on the spend ledger (today `ZC.spend.byDept` is a flat hardcoded map). |
| **"ROLES THIS DEPARTMENT BORROWS" capacity table** (role → total in pool → free now) | No per-role pool-availability query exists; nothing groups agents by role/function at all server-side beyond free-text `category` | 🆕🔌 Needs (a) the role/title field noted above, and (b) a live "how many agents of role X have no active run right now" aggregation — not present in any current endpoint. |
| **Skill/MCP/Automation/Hook "bound to department"** toggles | None of `SkillSchema`, `McpServerSchema`, `AutomationEventSchema`'s target, or `HookSchema` carry an `ownerSubsystem`-style field (only `Agent`/`Pipeline` do, per `03-backend-domain.md` §2) | 🆕🔌 Four new relations needed (or one generic "bindable entity ↔ subsystem" join), unless the intent is actually narrower — e.g. "bound" could mean "used by an agent/pipeline this subsystem owns" (derivable) rather than a first-class binding record. ❓ needs a decision on whether binding is a **new stored relation** or a **derived view** over existing `ownerSubsystem` tags on agents/pipelines that consume that skill/MCP/hook. |
| **Live handoff-in-flight indicator** (animated packet on the org-map focus panel's IN/OUT rows) | `HandoffSignal`/`HandoffOutcome` exist server-side (`handoff.service.ts`), but there's no live "currently transferring" read model — the mock infers "live" purely from the current subtask's run state (`working`/`thinking`) | 🔁 Mostly derivable from existing data (a task's current active subtask + its dept) without new storage — the animation trigger condition is just "is the current in-flight subtask's state active," which is already queryable. Low gap, flagged for completeness only. |
| **Agent pause/resume** (per-agent, not per-run) | Only run-level stop/resume exists (`useRunActions`, task-runs stop/resume) | 🔌 scope mismatch (see §5 row) — needs a decision on whether "pause this agent" means "stop its current run" (reuse existing endpoint) or a new agent-level "don't dispatch to this agent" flag (new concept, closer to a capacity/availability toggle). |
| **Session-scoped operator message → agent** ("Message Stuart in this session") | Chat is global (`/chat` transcript) or per-run log (read-only stream, no inbound message channel into a *running* agent) | 🆕🔌 No existing mechanism to inject an operator message into an in-flight `AgentRun`'s context — this is a genuinely new capability (steering a live run), not just a UI surface for existing data. |

---

## Key files referenced

- `/Users/zibby/Workspace/z.i.b.b.y/design/ZibbyCorp/ZibbyCorp App.dc.html` — shell (header, rail, dock, sheet, palette, theming, routing)
- `/Users/zibby/Workspace/z.i.b.b.y/design/ZibbyCorp/Org Screens.dc.html` — map/dept/pool/agent/chat
- `/Users/zibby/Workspace/z.i.b.b.y/design/ZibbyCorp/Dashboard.dc.html`, `Blueprint Screen.dc.html` — superseded prototype (zibby.js-only, 8-dept model), reference for glyph/layout mechanics only
- `/Users/zibby/Workspace/z.i.b.b.y/design/ZibbyCorp/ZibbyCorp Splash.dc.html`, `ZibbyCorp Directions.dc.html` — boot animation, design-reference doc (unconverted captions)
- `/Users/zibby/Workspace/z.i.b.b.y/design/ZibbyCorp/zibby.js` — glyph/dot/pod/packet/caret generators, legacy 8-dept RAW data (superseded by zc-data.js for the department/agent model, but its glyph/dot/caret generator functions are still the live implementation `zc-data.js`-era screens call into)
- `/Users/zibby/Workspace/z.i.b.b.y/design/ZibbyCorp/zc-data.js` — current 11-department data model (`ZC.depts/agents/chains/pipelines/tasks/companies/approvals/handoffRules/deptBudget/spend/registries/...`)
- `/Users/zibby/Workspace/z.i.b.b.y/design/ZibbyCorp/ZibbyCorp Design System.md` — token/component canon
- `/Users/zibby/Workspace/z.i.b.b.y/design/ZibbyCorp/Information Architecture.dc.html` — product spec (sitemap, flows, migration table)
- `/Users/zibby/Workspace/z.i.b.b.y/apps/web/components/layout/AppShell/AppShell.tsx`, `apps/web/features/chat/components/{ChatTopBar,ChatSearch,ChatToolDock,SubsystemOrbMap,StatusFlyoutPanel}.tsx` — current shell/home equivalents
- `/Users/zibby/Workspace/z.i.b.b.y/apps/web/features/subsystems/components/SubsystemDrawer/` — current department-detail equivalent (modal, 5 tabs)
- `/Users/zibby/Workspace/z.i.b.b.y/libs/contracts/src/subsystems/subsystem.schema.ts`, `agents/agent.schema.ts`, `handoff/handoff.schema.ts` — backend schemas cited throughout §6
