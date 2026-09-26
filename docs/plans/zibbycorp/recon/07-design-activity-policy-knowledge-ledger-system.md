# Design audit — Activity, Policy, Knowledge, Ledger, System screens

Scope: `design/ZibbyCorp/Activity Screens.dc.html`, `Policy Screens.dc.html`,
`Knowledge Screens.dc.html`, `Ledger Screens.dc.html`, `System Screens.dc.html`, plus
the relevant slices of `design/ZibbyCorp/zc-data.js` (mock data model, `window.ZC`)
and `zibby.js` (`window.ZB` — glyph/dot/pod/packet/caret render helpers, design-token
CSS vars). Read-only research against `/Users/zibby/Workspace/z.i.b.b.y`. All 5 files
render via a shared `<script type="text/x-dc">` `Component.renderVals()` that
branches on `route` (`"<section>/<screen>"`) — e.g. `activity/log`,
`policy/approvals`, `ledger/spend`. Not rendered live (no Playwright pass) — the
`.dc.html`/`zc-data.js` source was exhaustive enough that a browser pass would add
only pixel-precision, not structure; flagged as a follow-up if desired.

Design-system tokens (`ZibbyCorp Design System.md`) referenced by name throughout:
`--bg/--panel/--panel2/--line/--line2/--ink/--ink2/--ink3`, mono/sans type scale,
`space-*` (4/8 rhythm), `radius:0` everywhere, status hues `--s-work/-think/-block/
-err/-done/-idle` (canonical order **working → thinking → blocked → error → done →
idle**), corner-bracket focus device, the 12×12 procedural agent glyph.

---

## 1. Screen-by-screen inventory

### 1.1 Activity — Live log (`activity/log`, default state, `isLog`)

**Regions, top → bottom:**
1. Header row: mono label `ACTIVITY — LIVE LOG` (`--ink3`) · `h1` "Event stream" (32px/500) · right-aligned stream indicator (`streamDot` + `SSE · CONNECTED` / `PAUSED`, mono 11).
2. Filter bar (flex, `align-items:flex-end`, gap 14): three `<select>` filters — **DEPARTMENT** (all 11 + "All"), **AGENT** (all agents, label `name · role`), **TASK** (all tasks, label `id · title.slice(0,28)`) — each a mono-10 label above a 32px-tall bordered `<select>`. Then **PAUSE STREAM / RESUME STREAM** button and **CLEAR FILTERS** button (both secondary, mono 10, 32px tall).
3. Log panel: `border:1px solid var(--ink)` (focus panel), `--panel` bg.
   - Header row (grid `78px 44px 110px 100px 1fr`): `TIME · DEPT · AGENT · SUBTASK · EVENT`, mono 10 `--ink3`.
   - Body (`--bg`): up to 60 filtered lines (state caps internal buffer at 200, newest first), each a grid row: `t` (mono, `--ink3`), `dept` (dept code, `--ink2`), `agent` name + state dot (dot + uppercase name), `sub` (subtask id, `--ink2`), `text` (event verb string) + a blinking block caret (`zb-caret`) on the newest line only, when not paused. Newest line's text is `--ink`, all others `--ink2`.
   - Empty state: "Nothing matches yet. New events appear as they stream in." (13px, `--ink2`).

**Data fields:** per line — `t` (HH:MM:SS), `dept` (dept code via agent's `dept`), `agent` (uppercased name), `sub` (subtask id, e.g. `TSK-0142.2`), `text` (a verb-string drawn from a per-state `VERBS` table: working → "tool call → ok" / "wrote 3 files" / "ci.run → 12 passed" / "step progress +1" / "read 14 files"; thinking → "reasoning over context…" / "planning next edit" / "weighing 3 options"; blocked → "waiting at gate"; error → "retry scheduled"; done → "artifact posted to gate"), `color`, `caret`.

**Interactions:** filter by department/agent/task (client-side `<select>`s, independent), pause/resume the stream (freezes the `setInterval` tick), clear all filters. The stream is simulated client-side: a 1.4s interval picks a random non-idle agent, looks up its run's subtask, and prepends a random verb line for that agent's state; seeded on mount from the last 10 runs' `events[]` arrays (up to 200-line ring buffer).

**Empty state:** explicit copy shown when the filtered set is empty.

---

### 1.2 Activity — Runs (`activity/runs`, `isRuns`)

**Layout:** two-column grid `1.6fr / 1fr`, master list left, detail right (both `align-items:start`).

**Left column, top → bottom:**
1. Header: `ACTIVITY — RUNS` mono label · `h1` "Every run" · right meta `{{N}} RUNS · ${{total}}` (sum of all run costs).
2. Segmented state filter (`--line2` border container): `ALL / WORKING / THINKING / BLOCKED / ERROR / DONE`, each with its status dot except ALL; selected = `--ink` bg / `--panel` text.
3. Run table, `--panel` bg, `--line` border:
   - Header row (grid `84px 110px 100px 110px 60px 50px 60px`): `RUN · AGENT · SUBTASK · STATE · TIME · RETRY · COST` (right-aligned), mono 10 `--ink3`.
   - One button-row per run (clickable, selects it): `id` (mono, `--ink2`), `agentU` (agent name upper), `sub` (subtask id, `--ink2`), state dot + uppercase state label, `dur` (elapsed, `--ink2`), `retryStr` (zero-padded retry count), `costStr` (`$X.XX`, right-aligned). Selected row bg `--panel2`.

**Right column — run detail panel** (`--ink`-bordered, `--panel` bg):
1. Header: run id (mono `--ink3`) · agent name (18px/500) · right-aligned state dot + uppercase state.
2. Context line: `{{sub}} · {{taskTitle}} · {{deptName}}` (14px, `--ink2`).
3. 3-column metric strip (top/bottom `--line` hairlines): **DURATION**, **RETRIES** (zero-padded), **COST** (`$X.XX`) — each mono-10 label over a 20px/500 tabular-nums value.
4. **EVENTS** section label, then a numbered list (`01`, `02`, …) of the run's raw event strings (from `ZC.runs[].events[]`, e.g. "Loaded PR #318 diff · 14 files", "pr.review → 3 comments", "Requested changes on src/auth/callback.ts"), newest in `--ink`, rest `--ink2`.
5. Action row: **AGENT →** (secondary, flex 1, navigates to `org/agent/:id`) · **TASK →** (primary, flex 2, navigates to `work/task/:id`).

**Data fields:** `id, agent, sub, state, dur (mm:ss-ish string), retries (int), cost (number), events (string[])`. Default sort is array order (no explicit sort control); selection persists in component state (`this.state.run`, default `'RUN-8812'`).

**Filters:** state-only segmented control (no department/project/date filter on this screen, unlike Live log).

---

### 1.3 Activity — Inbox (`activity/inbox`, `isInbox`)

**Layout:** two-column grid `1.3fr / 1fr`.

**Left column:**
1. Header: `ACTIVITY — INBOX` mono label · `h1` "Inbound" · plain-text caption "Triaged by Monitoring & Ops".
2. Message list (`--panel` bg, `--line` border): each row is a button, grid `70px 1fr 96px`:
   - `src` badge (mono 10, bordered pill: `SLACK / GITHUB / E-MAIL / JIRA`).
   - Title (14px, truncated) + subline `{{from}} · {{when}}` (mono 10, `--ink3`).
   - Right: status dot + uppercase status label (`TRIAGE` blocked-dot / `TASK` working-dot / `DISMISSED` idle-dot).
   - Selected row bg `--panel2`.

**Right column — message detail** (`--ink`-bordered):
1. Header row: `id` · `src` · right-aligned `when` (all mono 10 `--ink3`).
2. Title (20px/500, wrapped).
3. `FROM · {{from}}` (mono 10 `--ink3`).
4. Body text (14px, `--ink2`).
5. **OPS TRIAGE** card (`--bg` inset, `--line2` border): triage verdict text (14px) + route string — `PROPOSED CHAIN · {{chainName}} · {{DEPT→DEPT→DEPT}}` or `NO CHAIN` (mono 10 `--ink2`).
6. If `status === 'pending'`: action row **DISMISS** (secondary, flex 1) / **CREATE TASK** (primary, flex 2).
7. If the item already has a task (`status === 'task'`): single full-width button **OPEN {{taskId}} →** (`--ink`-bordered).

**Data fields:** `id, src (SLACK/GITHUB/E-MAIL/JIRA), from, when, title, body, triage (text), chain (chain id or null), status (pending/task/dismissed), task (task id, once created)`.

**Interactions:** select a message; dismiss (marks `dismissed`, no task); create task (calls `ZC.createTask({title, chain, source, picked:'auto'})`, which builds a `route[]` from the chain and stamps subtask 1 `thinking`, links the item to the new task, and navigates to it); open the linked task.

**Empty state:** none explicitly coded (list always seeded from `ZC.inbox`, 7 fixed items) — no "inbox empty" copy exists in this file.

---

### 1.4 Activity — Briefings (`activity/briefings`, `isBrief`)

**Layout:** two-column grid `260px / 1fr`.

**Left column:** `BRIEFINGS` label, then a vertical list of briefing picker buttons — each shows date (mono 10 `--ink3`) + title (14px); selected item gets `--ink` border / `--panel2` bg.

**Right column — the briefing document** (`--panel`, `--line2` border, corner brackets top-left + bottom-right, max-width 760px, 28×32px padding):
1. Header row: COO glyph (22px, state `working` while reading aloud else `idle`) · `DAILY STANDUP · {{date}} · FROM ZIBBY` (mono 11 `--ink3`) · right-aligned **READ ALOUD / STOP** button (uses `window.speechSynthesis`).
2. `h1` title (32px/500), e.g. "Thursday standup".
3. Lead paragraph (18px/1.5).
4. Repeated sections, each `grid 120px / 1fr` with a top `--line` divider: section heading (mono 10 `--ink3`, e.g. `SHIPPED`, `IN FLIGHT`, `NEEDS YOU`, `SPEND`) + a stack of item strings (14px/1.5).

**Data fields:** `date, title, lead, sections: [heading, items[]][]`. Section headings observed: SHIPPED, IN FLIGHT, NEEDS YOU, SPEND (varies per day — the Tue/Wed briefings omit some sections).

**Interactions:** pick a past briefing from the rail; read-aloud toggle (client-side TTS of `lead + all section items`, cancels on unmount).

**Empty state:** none (3 fixed seed briefings; no "no briefings yet" state modeled).

---

### 1.5 Policy — Approvals (`policy/approvals`, `isApprovals`, default)

**Regions:**
1. Header: `POLICY — APPROVALS` mono label · `h1` "Needs you" · plain caption `{{N}} waiting · oldest {{wait}}`.
2. **Queue** table (`--ink`-bordered, `--panel` bg): header grid `84px 90px 2fr 1.4fr 50px 60px 200px` = `ID · KIND · REQUEST · RULE · DEPT · WAIT · (actions)`.
   - Each row: `id` (mono `--ink2`) · kind badge (blocked-dot + uppercase kind: `PUSH / QUESTION / HANDOFF / SPEND`) · request block (agent glyph 30px + request text (14px) + `{{AGENT}} · {{TASK or "NO TASK"}}` mono-10 subline) · `rule` (the matched rule's human text, 12px `--ink2`) · `deptCode` (mono 10) · `wait` (mono 10 elapsed) · action row: primary button (label `REPLY` for kind QUESTION, else `APPROVE`) / `DENY` (secondary) / `→` (icon-only, opens the sheet).
   - Empty state: "The queue is empty." (13px `--ink2`).
3. **HISTORY** section (label) → table (`--line`-bordered): header grid `84px 100px 90px 2fr 50px 90px 50px` = `ID · DECISION · KIND · REQUEST · DEPT · TASK · WHEN` (right-aligned). Rows show decision dot (done-dot for APPROVED, error-dot for DENIED) + uppercase decision, kind (mono 10), request text, dept code, task id, relative time.

**Data fields (queue item):** `id, kind (PUSH/QUESTION/HANDOFF/SPEND), task (nullable), dept, agent, wait (elapsed string), text (request), rule (matched-rule prose), diff (string[] — a diff/preview payload not rendered on THIS list row but present in the data model for an approval detail/sheet — see `AP-0091..94` samples: unified diff hunks, a draft doc, a PR artifact stat line, a spend projection)`.

**Data fields (history item):** `id, decision (APPROVED/DENIED), kind, text, dept, task, when`.

**Interactions:** Approve/Reply (primary action, resolves via `ZC.resolve(id,'APPROVED')` for non-question kinds, or opens the approval sheet for QUESTION kind so the operator can compose a reply), Deny (`open(id, true)` — opens the approval sheet in deny mode so a reason can be given), open detail (`→`, opens the approval sheet). `ZC.resolve()` on approve: flips the agent back to `working`, marks the blocked subtask `working` (and for a HANDOFF specifically marks it `done` with a produced artifact and starts the next subtask), moves the row from `approvals[]` to the front of `history[]`.

**Note — the approval detail "sheet" itself is not a screen in THIS file** — `Policy Screens.dc.html` only renders the **queue table row + history table**; the actual sheet UI (glyph, request text, rule that fired, diff/artifact, task chain, cost so far, APPROVE/DENY/OPEN SESSION actions per Information Architecture's Flow B) is implied by `openApproval(id, deny?)` being a **prop passed in from a parent** (`data-props` declares `openApproval:{tsType:"(id:string,deny?:boolean)=>void"}`) — i.e. the sheet is a shared/global overlay component owned elsewhere in the app shell, not owned by this screen. The `diff[]` array on each `ZC.approvals[]` entry is the payload that sheet would render (unified diff lines for PUSH, a Q&A draft for QUESTION, a PR stat line for HANDOFF, a spend projection for SPEND) — confirms Information Architecture Flow B step 03 ("Shows the rule that fired, the diff or artifact, the task chain and the cost so far") and step 04 ("Approve, Deny with a reason, or Open session with the agent. Merging a PR is never offered").

---

### 1.6 Policy — Gate rules (`policy/gates`, `isGates`)

**Regions:**
1. Header: `POLICY — GATE RULES` mono label · `h1` "What waits for you".
2. Two-column grid (`1fr / 1fr`):
   - **01 — FIXED FLOOR** (left, dashed `--line2` border, `--bg` bg — visually "locked/system" styling): header row label + `LOCKED` badge. Rows: `[action, consequence]` pairs (6 rows) — "Merge a pull request" → "Never offered. You merge by hand.", "Push to main or a release branch" → "Always asks", "Payments, purchases, spend limit changes" → "Always asks", "Delete data, drop tables, force-push" → "Always asks", "Send anything outside the company" → "Always asks the first time per recipient", "Read secrets or production credentials" → "Always asks". Footer note: "The floor applies to every project and no rule can loosen it."
   - **02 — HANDOFF RULES** (right, solid `--line` border, `--panel` bg): header + **+ RULE** button (adds a synthetic new rule from a fixed candidate-pair pool). Rows: `FROM-code → TO-code` chips + department-pair name (e.g. "Research & Development to Development") + a 2-way segmented **AUTO / ASK** toggle per rule.
3. **03 — PER-PROJECT RULES** panel (full width, `--panel`/`--line`): header row with a project-tab segmented control (`ALL` + one tab per project code). Rows: `project` id (mono) · `action` pattern (mono, e.g. `git.push feature/*`, `pr.open`, `db.query production`) · **AUTO/ASK** segmented toggle. Footer: an inline add-row — text input (placeholder "Action pattern, e.g. git.push release/*") + **+ ADD RULE** button (Enter-to-submit too).

**Data fields:** floor = `[label, consequence][]` (static, 6 entries). Handoff rule = `{from, to, mode: AUTO|ASK}` (7 seed rows: rnd→dev AUTO, dev→rel ASK, sec→dev AUTO, inc→dev AUTO, rel→com ASK, qa→dev ASK, rnd→knw AUTO). Project rule = `{i, project, action, mode: AUTO|ASK}` (7 seed rows across 4 projects).

**Interactions:** toggle a handoff rule's mode (AUTO/ASK, client-side only in the mock); toggle a per-project rule's mode; filter per-project rules by project tab; add a new per-project rule from free-text action pattern; add a new handoff rule (auto-picks the first unused from-to pair off a fixed candidate list — **no full rule-authoring form** in this mock, just a quick-add).

**Important simplification vs. the real gate model:** the mock only distinguishes two decisions, **AUTO vs ASK** — the real `DecisionSchema` is a 4-value enum (`allow/notify/ask/deny`), and handoff has 3 tiers (1 silent / 2 dispatch+report / 3 park-as-approval), not 2. The "fixed floor" in the mock is prose-only (label+consequence strings); the real `POLICY.md` rules are structured `MatchCondition[]` → `Decision` → `Resolve` trees, richer than a flat 2-column list.

---

### 1.7 Policy — Learned patterns (`policy/patterns`, `isPatterns`)

**Regions:**
1. Header: `POLICY — LEARNED PATTERNS` mono label · `h1` "Suggested rules" · caption "Built from your past approvals. Nothing changes until you accept."
2. Card grid (`repeat(auto-fill, minmax(360px,1fr))`, gap 12). Each pattern card (`--panel` bg, border = `--ink` once accepted else `--line`):
   - Header row: `{{id}} · {{SCOPE}}` (mono 10 `--ink3`) — right: status text (`NOW A RULE` / `DISMISSED` / `{{n}} / {{of}}` fraction, zero-padded).
   - Suggested-rule text (16px/500, e.g. "Auto-approve git.push fix/* on api").
   - A row of small square dots — `of` total cells, `n` colored `done` (purple) and the rest `error` (red) — a literal hit/miss strip (design system's "cell strip" pattern repurposed as an evidence visualization).
   - Evidence caption (13px `--ink2`, e.g. "You approved 9 of 9 in the last 14 days").
   - If not yet decided: action row **ACCEPT AS RULE** (primary, flex 2) / **DISMISS** (secondary, flex 1).

**Data fields:** `id (LP-NN), text (proposed rule sentence), evidence (prose), n/of (hit counts), scope (api / Handoff / Communications / Finance)`. 4 seed patterns.

**Interactions:** accept (marks `accepted` locally; ONE hardcoded side effect exists in the mock — accepting `LP-12` (scope `api`) pushes a new `AUTO` per-project rule `git.push fix/*` into `ZC.projectRules`, i.e. accepting IS creating a policy-gates rule); dismiss (marks `dismissed`, no further action). No "undo"/edit-before-accept flow.

---

### 1.8 Knowledge — Vault (`knowledge/vault`, `isVault`, default)

**Layout:** 3-column grid `240px / 1fr / 260px`.

**Left column — folder/note nav:**
1. Search input ("Search the vault") — filters notes client-side by title+body substring match.
2. Per-folder groups (`[...new Set(notes.map(n=>n.folder))]`, only folders with ≥1 matching note shown): folder label (`NAMEU · count`, mono 10 `--ink3`), then a vertical list of note-title buttons, each with a left border (`--ink` when selected, else `--line`) and `--panel2` bg when selected.

**Center column — note article** (`--panel`, `--line2` border, corner brackets top-left + bottom-right, min-height 480px):
1. Breadcrumb: `{{FOLDER}} / {{TITLE}}` (mono 11 `--ink3`).
2. `h1` title (32px/500).
3. Body paragraphs — each paragraph is tokenized into plain-text spans and `[[wikilink]]` spans; a wikilink span renders as an underlined button that navigates to that note id (`onClick: open(id)`), with an optional `[[target|label]]` alias.
4. Footer meta (pinned `margin-top:auto`): `OWNED BY KNOWLEDGE MANAGEMENT · LAST DISTILLED 02:11` (mono 10 `--ink3`, static/hardcoded string in this mock — not derived from real distill data).

**Right column — link panels:**
1. **BACKLINKS · {{count}}** panel — notes whose body contains a `[[thisNoteId]]` link, each a button row (title + folder, `--line`-bordered). Empty state: "No notes link here."
2. **OUTGOING · {{count}}** panel — the deduped set of wikilink targets found in the current note's body, each a plain title button row.

**Data fields (note):** `id, folder (free string — NOT the real 3-tier system), title, body (string[] paragraphs with [[links]])`. 10 seed notes across folders: MOC, Company, Projects (×2), Research, Runbooks, Daily (×2).

**Interactions:** search-filter the nav; click a note (nav, wikilink, backlink, or outgoing link) to open it; navigation is entirely client-side note-id lookup (`V.find(n=>n.id===id)`), no create/edit affordance anywhere on this screen (no "new note" button, no edit-in-place).

**Gap vs. real vault UI:** the mock's `folder` grouping (MOC/Company/Projects/Research/Runbooks/Daily) does **not** match the real 3-tier `MemoryTierSchema` (`memory`/`daily`/`knowledge`) — the mock invents a richer folder taxonomy the backend has no concept of (folders are a derived/virtual grouping in the real system, likely from `path` or `frontmatter`, not a first-class field).

---

### 1.9 Knowledge — Distillation (`knowledge/distill`, `isDistill`)

**Regions:**
1. Header: `KNOWLEDGE — DISTILLATION` mono label · `h1` "Nightly runs" · caption "Every night at 02:00, Knowledge Management folds the day into the vault." · right-aligned **RUN NOW / RUNNING…** primary button.
2. Two-column grid `300px / 1fr`:
   - **Left — run picker list:** each run is a button card (`--line`-bordered, selected = `--ink` border/`--panel2` bg): header row `{{id}}` + state dot/label (`RUNNING` working-dot / `DONE` done-dot) · date/time (14px) · meta line `{{notes}} NOTES · {{gaps}} GAPS · {{dur}}` (mono 10 `--ink2`).
   - **Right — run detail** (`--ink`-bordered):
     1. Header: `{{id}}` (mono `--ink3`) · date (18px/500).
     2. 3-column metric strip: **NOTES READ**, **LINKS ADDED**, **DURATION**.
     3. Two-column split (`--line` divider):
        - **GAPS FOUND · {{count}}** — each gap is a card (`--line2`/`--bg`): gap text (13px, wikilinks stripped to plain text) + a button **CREATE TASK →** (or, once filed, **FILED · {{taskId}}**, which instead navigates to the task). Empty: "No gaps."
        - **APP IDEAS · {{count}}** — each idea is a dashed-border card (13px text), read-only, no action.

**Data fields (distill run):** `id (DST-NNNN), date, notes (int, notes read), links (int, links added), dur (string), gaps (string[], wikilink-embedded), ideas (string[])`. 3 seed historical runs + a simulated live run when "RUN NOW" is clicked (3s fake delay, then produces 1 gap + 1 idea).

**Interactions:** pick a past run from the list; "RUN NOW" triggers a synthetic in-progress run then resolves; file a gap as a task (`ZC.createTask({..., chain:'research', source:'Distillation {{id}}'})`, memoized per gap so re-clicking "FILED" instead opens the created task).

---

### 1.10 Ledger — Budgets (`ledger/budgets`, `isBudgets`, default)

**Regions:**
1. Header: `LEDGER — BUDGETS` mono label · `h1` "Run caps" · caption "Managed by Finance. When a cap is hit, new runs wait in NEEDS YOU."
2. 3-up card row — **DAY CAP / WEEK CAP / MONTH CAP**: each card shows label + pct (top row), `{{used}} / {{cap}} runs` (28px/500 + 14px gray denominator, locale-formatted thousands), a 2px progress bar (`--ink` fill on `--line` track), and a reset-schedule caption (`RESETS 00:00 UTC` / `RESETS MONDAY` / `RESETS 1 OCTOBER`).
3. Per-department table (`--panel`/`--line`): header grid `50px 1.4fr 2fr 70px 110px` = `CODE · DEPARTMENT · TODAY (progress bar + dot) · USED (right, "N · pct%") · DAILY CAP (editable number input, 90px wide)`. All 11 departments, one row each. The progress bar's trailing dot color = `error` (≥95%), `blocked` (≥80%), else `working`.

**Data fields:** `ZC.budget = {day:[used,cap], week:[used,cap], month:[used,cap]}` (global, run-count only — NOT dollars); `ZC.deptBudget = {deptId: [used,cap]}` (11 entries, daily run-count caps only, editable inline).

**Interactions:** edit a department's daily run cap via the number input (client-state only, `Math.max(1,...)` floor); no create/delete of a department row (fixed 11-row set); no weekly/monthly per-department breakdown (only daily is shown per-department — day/week/month rollups exist only at the GLOBAL 3-card level, not per department).

---

### 1.11 Ledger — Spend (`ledger/spend`, `isSpend`)

**Regions:**
1. Header: `LEDGER — SPEND` mono label · `h1` "{{$X.XX}} today".
2. 3-up meter row — **SUBSCRIPTION · 5H WINDOW**, **SUBSCRIPTION · WEEK**, **AGENT SDK CREDIT · MONTH**: each a card (border = `--ink` once warn/stop, else `--line`) with label + right-aligned state dot/label (`OK` / `WARNING` / `STOPPED`), a big value (28px/500 — a percent for the two subscription meters, a `$used / $cap` string for the SDK-credit meter), a 6px-tall progress bar with TWO tick markers overlaid at the warn% and stop% positions (`--ink2` and `--ink` 1px verticals), and a note caption (reset time / "Used when the subscription window is exhausted").
3. Two-column layout (`1.5fr / 1fr`):
   - **Left — SPEND BY DEPARTMENT · TODAY** table: one row per department — code, name, a horizontal bar (width = pct of the max-spending department, `--panel2` track / `--ink` fill), dollar amount right-aligned.
   - **Right — THRESHOLDS panel** (`--ink`-bordered): two range sliders — **Warn at** / **Stop at** (50–100%, live % label, each with an explanatory caption: "Finance posts a note to the briefing and the header bar turns amber." / "New runs pause and wait in NEEDS YOU."), then a divider and an **AGENT SDK CREDIT · MONTHLY CAP** number input + caption "Raising the cap still goes through NEEDS YOU."

**Data fields:** `ZC.spend = {sub5h: pct, subWeek: pct, sdk:[used,cap] (dollars), warn: pct, stop: pct, today: dollars, byDept: {deptId: dollars}}`.

**Interactions:** drag warn/stop threshold sliders (live-updates both meters' tick markers and the OK/WARNING/STOPPED derived state); edit the SDK monthly cap number; no per-department cap editing on THIS screen (that lives on the Budgets screen, and only for run-count, not dollars).

---

### 1.12 System — Settings (`system/settings`, `isSettings`, default)

**Regions:**
1. Header: `SYSTEM — SETTINGS` mono label · `h1` "Settings" · right-aligned autosave indicator (`CHANGES SAVE AUTOMATICALLY` / `SAVED {{HH:MM:SS}}` after an edit).
2. Three grouped panels (`--panel`/`--line`), each a header bar + a list of two-column rows (`label+help` / `control`):
   - **GENERAL**: Company name (text input) · Time zone (text input) · Concurrent agents (segmented `6/12/24`).
   - **VOICE**: Wake word (text input, "Hey Zibby") · Voice (segmented `CALM/BRISK/NEUTRAL`) · Push to talk (segmented ON/OFF) · Speak replies (segmented ON/OFF).
   - **THEME**: Appearance (segmented LIGHT/DARK, driven by a `theme`/`setTheme` prop from the app shell, not local state) · Motion (segmented ON/OFF, with help text "Off also follows reduced motion").

**Data fields:** `ZC.settings = {name, tz, lang, concurrency, wake, voice, ptt, speak, theme, motion}` — flat, single-tenant, client-only object (`Object.assign(S, patch)` on every field change, no persistence beyond the in-memory mock).

**Interactions:** every row saves instantly on change (no explicit Save button) and flashes a `SAVED {{time}}` confirmation in the header.

**No sub-tabs on this screen** — unlike the real app's 11-tab `/settings`, the mock's Settings screen is a single flat page with 3 groups (General/Voice/Theme) covering a small, mostly-new (voice, company identity) surface.

---

### 1.13 System — Registries (`system/registries`, `isRegistries`)

**Regions:**
1. Header: `SYSTEM — REGISTRIES` mono label · `h1` "Global libraries" · caption "Departments bind to these in their own tabs."
2. Top tab bar (4 tabs, bottom-border-active style): **MCP SERVERS · SKILLS · HOOKS · COMMANDS**, each with a zero-padded count.
3. Table (`--panel`/`--line`), columns depend on active tab: `NAME · DESCRIPTION · {{metaHead}} · BOUND IN`, where `metaHead` = `STATUS` (mcp) / `TYPE` (skills) / `EVENT` (hooks) / `SCOPE` (commands).
   - **MCP rows**: name, description, status dot (`working` if `connected` else `blocked`) + uppercase status (`connected`/`limited`), bound-department chip row (clicking a chip navigates to `org/dept/:id/integrations`; a `['*']`-bound row instead shows a single `ALL` chip that navigates to `org/map`).
   - **Skills rows**: name, description, static `SKILL` meta tag, bound-department chips (navigate to `org/dept/:id/skills`).
   - **Hooks rows**: name, description, event string uppercased (e.g. `PRETOOLUSE · GIT.PUSH`), bound-department chips (a `['*']` row = global, shown as `ALL`).
   - **Commands rows**: name, description, static meta `⌘K · COO`, single `GLOBAL` chip (no navigation wired — `onClick:()=>{}`).

**Data fields:**
- `ZC.registries.mcp`: `[name, desc, status(connected|limited), boundDeptIds[]]` — 10 seed servers (github, slack, gmail, jira, google-calendar, sentry, stripe, postgres, obsidian-vault, filesystem).
- `.skills`: `[name, desc, boundDeptIds[]]` — 10 seed skills.
- `.hooks`: `[name, event, desc, boundDeptIds[]]` — 5 seed hooks (pre-push guard, secret scan, post-edit lint, subtask done, ground session), most bound `['*']`.
- `.commands`: `[name, desc]` — 8 seed slash commands (`/task /chain /approve /brief /distill /budget /pause /status`), no per-department binding modeled at all (commands are COO-global only in this mock).

**Interactions:** switch tabs; click a bound-department chip to deep-link into that department's own tab for the same registry kind. **No create/edit/delete affordance anywhere on this screen** — it's presented as a pure read-only catalog/index; CRUD presumably lives elsewhere (a registry-item detail page implied but not included in this file, or department-scoped binding UI).

---

## 2. Design screen → current route/component/API mapping

Legend: ✅ exists (re-skin only) · 🔁 exists but must move/restructure · 🆕 frontend-only (new UI over existing data) · 🆕🔌 needs backend/contract work · ❓ operator decision needed.

| Design screen | Current equivalent | Status | Notes |
|---|---|---|---|
| **Activity → Live log** | No direct equivalent. Closest: `ChatLiveLog` widget (`apps/web/features/chat/components/ChatLiveLog.tsx`, "reuses old HUD RightRail data wiring") + `GET /api/events` SSE (global `ActivityKindSchema` feed, `apps/api/src/events/events.controller.ts`) + per-run `GET /api/tasks/runs/:runId/logs/stream` SSE | 🆕🔌 | The design shows a **cross-run, tool-call-granularity** merged stream (`"wrote 3 files"`, `"ci.run → 12 passed"`) filterable by department/agent/task. The real activity feed is coarser (~40 closed `ActivityKind` values like `run-started`, `gate-decision`, `handoff` — high-level lifecycle events, not per-tool-call text) and per-run log streams are scoped to ONE run at a time. **No backend endpoint fans multiple live per-run log streams into one filterable global feed** — building this screen 1:1 needs either (a) accepting the coarser activity-feed granularity (re-skin, ✅-ish) or (b) a new aggregating SSE endpoint (🆕🔌, larger lift). Department/agent/task filters ARE buildable today (activity items carry refs).
| **Activity → Runs** | `/archiv` (`apps/web/features/archive/Screen.tsx`, `ArchiveRow.tsx`, `useArchiveRunsInfiniteQuery`) — the task/run archive; also `GET /api/tasks/runs` / `/runs/archive` (`task-runs.contract.ts`, `TaskRunSchema`) | 🔁 | Same underlying data model (`TaskRun`: id/status/costUsd/stageRuns/etc.) and list+detail master/detail UX already exists almost 1:1 (`ArchiveRow` ≈ the design's run-table row). Needs: (1) rename/relocate under Activity per the new IA, (2) a **state segmented filter** (today `/archiv` has a subsystem filter + search, not a state filter), (3) surface **retries** — real retries only exist on pipeline runs (`ParkedDetail.attempts`, `retries: Record<phase,count>`), not as a flat per-run int the design implies for every run kind — needs UI logic to compute a display value per run kind (blank/— for agent runs). Cost (`costUsd`) already exists.
| **Activity → Inbox** | Nested inside `/projects/:id?tab=integrations` today (`features/channels`? — actually `apps/web` has no dedicated channels feature per `02-web-routes.md`; inbound items surface via `StatusFlyoutPanel`/approvals only) + `GET /api/channels/items` (`channel.contract.ts`, `ChannelItemSchema`) | 🆕🔌(partial) | **No standalone Inbox route exists today** — channel items are scattered (approval flyout, e2e `channels.spec.ts` touches `/projects/:id?tab=integrations` only). The backend data (`ChannelItem`: src/from/text/state/triage/url/taskId/approvalId) covers almost everything the mock needs EXCEPT a free-text "OPS TRIAGE" verdict sentence + a "proposed chain" string — real `TriageVerdict` is category+confidence, not prose, and **there is no "chain" concept in the backend at all** (see §3). Needs a new global Inbox list+detail screen (frontend), reusing existing channel data, with the chain-route line either dropped or backed by new "chain" data.
| **Activity → Briefings** | No dedicated route. `GET /briefing` + `POST /briefing/generate` (`briefing.contract.ts`) consumed only from `/chat`'s top bar + a ⌘K action (per `02-web-routes.md` §2/§3, `features/briefing`: `useGenerateBriefingMutation` only, no list/history query) | 🆕🔌(partial) | Backend has a rich `BriefingSchema` (needsYou/did/engagements/watch/subsystem lines) generated fresh each call and PERSISTED to the vault on `generate` — but **there is no "list past briefings" read endpoint** (`GET /briefing` reads "the current" one; history would have to come from the vault notes it's persisted into, or a new list endpoint). The mock's picker rail (3 fixed past briefings) has no backing query today. Read-aloud (`speechSynthesis`) is pure frontend, no backend need — matches existing TTS conventions elsewhere (`ttsVoice` system config, `/settings?tab=chat`'s speak toggle) loosely.
| **Policy → Approvals** | Scattered: `StatusFlyoutPanel` (`apps/web/features/chat/components/StatusFlyoutPanel.tsx`) pending-section rows + inline approve/reject in `/chat` task gutter. **No dedicated approvals list/history route** (confirmed by `02-web-routes.md` §8 point 6) + `GET /api/approvals` (`approvals.contract.ts`) | 🆕🔌(partial) | Queue+history table is new frontend work over an EXISTING, well-shaped API (`listPendingApprovals` already supports `?status=` filtering for both pending and history in one endpoint). Gaps: no "rule that fired" field, no diff/cost-so-far on `Approval` (see §3), and `reject` takes an **empty body** — no reason field exists server-side despite the design's "Deny with a reason" (Flow B step 04) and the mock's `diff`/reason UI.
| **Policy → Gate rules (floor)** | `/settings?tab=gates` → `SystemFloorPanel` (`features/gates/components/SystemFloorPanel.tsx`) + `GET /gates/policy` | ✅ | Direct re-skin — locked/system rules already render read-only today.
| **Policy → Gate rules (handoff)** | `SubsystemDrawer` → Handoff tab → `HandoffRulesSection`/`HandoffRuleEditor` (`features/handoff`) + `GET/POST/PUT/DELETE /handoff-rules` | 🔁 | Exists as a per-subsystem drawer tab; needs to move to a global Policy page (all 11 depts' handoff rules in one table, per the mock) and the mock's 2-value AUTO/ASK toggle needs to become the real 3-tier (1/2/3) control, or the UI intentionally collapses tier 1+2 into "AUTO" (a product decision — tier 2 still reports, tier 1 is silent, the mock doesn't distinguish).
| **Policy → Gate rules (per-project)** | `/settings?tab=gates` → `GateRulesSection` (global gate-rule catalog, `GET/POST/PUT/DELETE/reorder /gate-rules`) + `/agents/:id` → `AgentRulesSection`/`RuleModal` (per-agent rules) | 🔁 | The GLOBAL gate-rule catalog (`GlobalGateRuleSchema`, ordered, first-match-wins) is the closest match, but it's not natively "per-project" — `GlobalGateRuleSchema`'s `match[]` conditions include a `scope` type that likely carries project scoping (needs schema check, not confirmed field-by-field here) but the existing UI groups by rule, not by project tab. The mock's simple `AUTO/ASK` toggle per action-pattern is a MUCH simpler mental model than the real `MatchCondition[]→Decision→Resolve` tree (`RuleCard`/`RuleModal` already expose the richer model) — reusing `RuleCard` wholesale would show more complexity than the mock designs for; a decision is needed on how much of the real model surfaces here (❓).
| **Policy → Learned patterns** | `GET /review-rules?scope=` + `POST /review-rules/:projectId/:ruleId/promote` (`review-learning` domain, `ReviewRuleSchema`) | ❓🆕🔌 | **Domain mismatch, not just a missing UI.** The real "learned rules" are distilled from **PR review comments** (grounds future code generation — "primitivy ber z libs/design-system…") — nothing to do with approval/gate-rule suggestions. The design's "Learned patterns" is a DIFFERENT, NEW capability: mining the **approval history** for repeated approve/deny patterns and proposing them as new gate/handoff rules. No backend concept of this exists at all (no aggregation of `Approval`/history by action-pattern, no "propose a gate rule" generator). This needs a genuinely new backend capability, not a re-skin of `review-learning` — flag for a scoping decision (❓) on whether "Learned patterns" is redefined to mean review-rules (rename the design) or built as new.
| **Knowledge → Vault** | `/memory` (`features/memory/Screen.tsx`, `MemoryGraph.tsx`, `NoteView.tsx`, `NoteEditorDialog.tsx`) + `GET /memory/index|note/:id|graph|search` | 🔁 | Real `/memory` is a **force-directed graph + tier filter (all/memory/daily/knowledge) + index-first search**, quite different in presentation from the mock's **folder-tree nav + article reader + backlinks/outgoing side panels**. Both read the same underlying note graph (`links`/`backlinks` already exist server-side) — this is a full UI redesign (from graph-viz to a Roam/Obsidian-style three-pane reader) over existing data, EXCEPT the mock's `folder` taxonomy (MOC/Company/Projects/Research/Runbooks/Daily) has no backend field — real notes have `tier` (3 values) + optional `subsystem`/`project`/`domain`, not a free grouping label (see §3). No create/edit affordance shown in the mock (unlike real `/memory` which has `NoteEditorDialog`/`QuickCapture`) — likely an oversight/simplification in the mock rather than an intentional read-only redesign.
| **Knowledge → Distillation** | Settings→Automations row for the `memory-distill` system automation (`target.type: "memory-distill"`) + `POST /automations/:id/trigger`; `gap-detect` is a SEPARATE automation target. **No dedicated distillation-run history/detail screen exists today** | 🆕🔌(partial) | The mock's single "distillation run" bundles NOTES READ/LINKS ADDED/DURATION (a memory-distill run) with GAPS FOUND + APP IDEAS (implying `gap-detect`'s output) into ONE run record — but backend-side these are two separate automation targets with, presumably, two separate run histories. Needs: (a) confirm whether `AutomationRunSchema` carries a structured output payload (gaps[]/ideas[]) today — likely NOT, automations probably just log a summary — and (b) either merge memory-distill+gap-detect into one conceptual "Distillation" unit for the UI, or split the mock's screen into two tabs. "CREATE TASK" from a gap reuses the same `createTask`-style flow as Inbox — maps to the real task-creation API cleanly.
| **Ledger → Budgets** | Settings has NO dedicated budgets tab; closest is `/projects/:id` (overview tab) → `ProjectBasicsPanel`'s budget fields (daily/weekly/monthly run caps + concurrent cap + cost caps) — **per-project**, `GET /budget` (`BudgetStatusSchema`, per-project rows) | 🆕🔌 | **Structural mismatch**: the design wants budgets **per department** (11 rows, one cap each); the real system has budgets **per project** (`ProjectBudgetStatusSchema`) plus one global rolling/weekly ceiling (`GlobalBudgetSchema`) — there is **no per-subsystem budget concept anywhere** (confirmed absent from `03-backend-domain.md`'s gap analysis, item 5/6). This needs a genuine new backend capability (per-subsystem run-count caps + a way to attribute a run's cost to a subsystem for rollup — `Approval.ownerSubsystem` exists as a precedent for subsystem attribution, but runs/tasks don't carry it uniformly for budget purposes). Global day/week/month cards ARE close to the real global ceiling, but that's expressed as PERCENTAGE-pause-thresholds (`pauseAtRollingPct`/`pauseAtWeeklyPct` against the Claude usage window), not run-count caps with day/week/month resets — a different mental model entirely.
| **Ledger → Spend** | `LimitsRings` (`components/layout/LimitsRings/`, Claude 5h/weekly gauge) + `GET /limits` + `GET /budget` (global rolling/weekly + `paused` flag) | 🆕🔌 | Subscription 5h/week meters map directly to `GET /limits` (`LimitsSchema.rolling/weekly`, already polled elsewhere in the app) — ✅ for those two meters. **"Agent SDK credit" has NO backend concept at all** — no schema field, no cost-tracking dollar-credit pool distinct from the Claude subscription window (see §3). **Spend-by-department has no backend source** — same gap as Budgets (no subsystem-level cost attribution/aggregation exists). Warn/stop threshold sliders map to `pauseAtRollingPct`/`pauseAtWeeklyPct` (`GlobalBudgetSchema`, already a read/write pair) — ✅ for those, assuming the UI accepts they gate the SUBSCRIPTION window (not a fictional SDK credit).
| **System → Settings** | `/settings` (11 tabs: preferences, gates, tasks, automations, chat, activity, mandate, runtime, machine, selfKnowledge, system) | 🔁 | The mock's flat 3-group page (General/Voice/Theme) is a much-reduced subset of the real 11-tab settings hub — see §4 for the full per-tab landing-spot table. `theme` (light/dark) maps directly to the existing `DesignSystemProvider theme=` + `/settings` preferences-tab toggle (✅). `concurrency` segmented maps loosely to real `maxConcurrentRuns` (free int, not a 6/12/24 enum) — ✅ with a control-type change. `wake`/`voice`(CALM/BRISK/NEUTRAL)/`ptt`/`speak` are a NEW voice-input surface not present in the real settings model today (real `ttsVoice` is a free-string voice-daemon id from `GET /speech/voices`, not a 3-value mood enum; no wake-word or push-to-talk config exists anywhere in `SystemConfigSchema`) — 🆕🔌. "Company name"/"Time zone" as global identity fields don't exist (`SystemConfigSchema` has neither) — 🆕🔌, and collide conceptually with the per-project `ProjectDailyRhythmSchema` (which already has project-level timezone/standup timing) — needs a scoping decision (❓ operator vs. per-project).
| **System → Registries (MCP)** | `/mcp`, `/mcp/:id` (`features/mcp`) + `GET/POST/PUT/DELETE /mcp-servers` | 🔁 | Existing full CRUD screen; needs (a) relocate under System→Registries per new IA, (b) add a "bound in [department chips]" column — **no backend concept of an MCP server being bound to a subsystem exists** (per `03-backend-domain.md` §2: "integrations do NOT carry ownership — membership is derived by rule, not stored" — same is true for MCP servers, which aren't even integrations, they're a separate top-level entity with no subsystem link at all) — 🆕🔌 for the binding data, 🔁 for the rest.
| **System → Registries (Skills)** | `/skills`, `/skills/:id` (`features/skills`) + `GET/POST/PUT/DELETE /skills` | 🔁 | Same pattern as MCP — full CRUD exists, needs relocation + a "bound departments" column with no backing field today (skills have no `ownerSubsystem`-equivalent at all, unlike Agent/Pipeline) — 🆕🔌 for binding.
| **System → Registries (Hooks)** | `/hooks`, `/hooks/:id` (`features/hooks`) + `GET/POST/PUT/DELETE /hooks` | 🔁 | Same pattern; hooks likewise have no subsystem binding field today.
| **System → Registries (Commands)** | `/commands`, `/commands/:id` (`features/commands`) + `GET/POST/PUT/DELETE /commands` | 🔁 | Same pattern; the mock shows commands as globally COO-scoped with no per-department binding at all (simplest of the four) — smallest lift.

---

## 3. Field-level data gaps

Backend contract fields cited by file/schema name; "MISSING" = no equivalent field/endpoint found anywhere in `libs/contracts/src`.

### Approvals (Policy → Approvals)
- `Approval` (`libs/contracts/src/approvals/approval.schema.ts`) has: `id, runId, kind, skill, action, detail, risk, status, requestedAt, decidedAt?, ownerSubsystem?, sourceUrl?`.
- **MISSING** `rule` — "the rule that fired" (Information Architecture Flow B step 03 explicitly names this). No field links an `Approval` back to the `GateRule`/`HandoffRule` id that produced it.
- **MISSING** `diff`/artifact preview — the mock's `diff: string[]` (unified diff / draft text / PR stat / spend projection) has no schema counterpart. `detail: string` is free text only, not structured, and there's no reference to a `RunArtifact`/PR diff from the approval itself (would need to resolve via `runId` → run → artifacts, an extra hop the UI would have to do itself, and even then a raw git diff isn't a modeled artifact type anywhere confirmed).
- **MISSING** "cost so far" on the approval — would need a join through `runId` → `TaskRun.costUsd`, not carried on `Approval` directly (doable client-side with an extra query, not a hard blocker, but not a single-field read either).
- **MISSING** deny reason — `rejectApproval`'s body is `EmptyBodySchema` (no fields at all). The design's Flow B step 04 ("Deny with a reason") and the mock's implied deny-with-reason flow (`ZC.resolve(id,'DENIED',reason)` takes an optional `reason` client-side) have no server-side counterpart — a denial reason is currently unrecorded.
- **PRESENT but different shape**: `wait` (elapsed since request) is computed client-side from `requestedAt` today — fine, no gap.

### Gate rules / Handoff (Policy → Gate rules)
- `GateRule`/`GlobalGateRuleSchema` (`libs/contracts/src/gates/gate.schema.ts`): real decisions are a 4-value enum (`allow/notify/ask/deny`) with a recursive `resolve` tree (`human/check/agent/all/any`) — the mock's flat AUTO/ASK 2-state toggle is a UI simplification, not a missing field, but building the mock literally would UNDER-represent (and potentially misrepresent) what a rule can actually do; a straight re-skin would need to either restrict itself to allow/ask-only rules or extend the toggle to a proper decision picker.
- `HandoffRule` (`libs/contracts/src/handoff/handoff.schema.ts`): real `tier` is `1 | 2 | 3`, not binary. Tier 2 ("dispatch and report") has no representation in the mock's AUTO/ASK toggle at all — would silently collapse into "AUTO" and lose the "act-then-report" distinction the rest of the app relies on (Law/tier system).
- Per-project rules: the mock's `{project, action, mode}` shape doesn't obviously match `GlobalGateRuleSchema`'s `MatchConditionSchema` (tool/action/threshold/scope/context conditions) — needs a schema-level check of whether `scope` can express "this project" cleanly, not confirmed in this pass.

### Learned patterns (Policy)
- **MISSING wholesale** — no backend aggregates `Approval`/`ApprovalHistory` by action-pattern to compute "you approved 9 of 9" hit-rate evidence, and no "propose a new gate/handoff rule from this pattern" generator exists. `ReviewRuleSchema` (review-learning) is evidence-and-propose shaped similarly (`occurrences[]`, `status: observed→proposed→active`) and could be a MODEL to follow, but it's scoped to PR-review-comment text, not approval decisions — a genuinely new domain.

### Vault / Distillation (Knowledge)
- `NoteSchema` (`libs/contracts/src/memory/memory.schema.ts`): has `tier` (3-value), `subsystem?`, `domain?`, `type?`, `tags?` — **no `folder` field**. The mock's 6-folder taxonomy (MOC/Company/Projects/Research/Runbooks/Daily) has no server-side source; would need to be derived (e.g. from `path` prefix, or a redesigned frontmatter convention) or the UI redesigned around the real 3-tier model instead.
- Distillation: `AutomationSchema`'s `target: {type: "memory-distill"}` / `{type: "gap-detect"}` are confirmed target kinds (`libs/contracts/src/automations/automation.schema.ts`), but **no schema for a structured distillation-run RESULT** (notes-read count, links-added count, gaps[], ideas[]) was found in this pass — automation runs likely log free text only. This needs verification of `AutomationRunSchema`/wherever automation trigger results are persisted (not read in this pass — flag for follow-up) before assuming the mock's structured metrics+gaps+ideas payload can be read back at all.

### Budgets / Spend (Ledger)
- `ProjectBudgetStatusSchema`/`BudgetStatusSchema` (`libs/contracts/src/budget/budget.schema.ts`): per-project only (`daily/weekly/monthly` run-count `BudgetWindowUsage` + `dailyCost/weeklyCost/monthlyCost` `CostWindowUsage`). **MISSING** any per-subsystem/department rollup — no `SubsystemBudgetStatus` or equivalent exists, and subsystems have no `budget` field on `SubsystemSchema` at all (confirmed in `03-backend-domain.md` §7 gap list, item 5/6).
- **MISSING** "Agent SDK credit" — no schema field anywhere names a dollar-credit pool distinct from the Claude subscription rolling/weekly window (`LimitsSchema` is pure percentage-of-window, no dollar figure; `CostWindowUsageSchema` is per-project cost tracking, not a company-wide SDK-credit pool with its own cap). This is a wholly new billing concept the design invents.
- **MISSING** spend-by-department aggregation — same root cause as the budgets gap: no subsystem attribution on cost data. `Approval.ownerSubsystem` (optional, request-time stamp) is the ONE existing subsystem-cost-adjacent field in the whole codebase, and it's on approvals, not on runs/cost lines.
- **PRESENT**, straightforward: `pauseAtRollingPct`/`pauseAtWeeklyPct` (`GlobalBudgetSchema`) already are exactly the warn/stop-style thresholds the Spend screen's slider pair wants — but only ONE pair exists server-side (used for "pause"), while the mock implies TWO semantically distinct levels (warn = notify only, stop = hard pause) — real schema only has pause thresholds, no separate "warn" concept; would need a new optional field (e.g. `warnAtRollingPct`) or client-side derivation (e.g. warn = 80% of pause threshold).

### Registries (System)
- MCP/Skills/Hooks/Commands entities (`McpServerSchema`, `SkillSchema`, `HookSchema`, `CommandSchema`) all lack any subsystem/department binding field. Only `Agent`/`Pipeline` carry `ownerSubsystem` today (`03-backend-domain.md` §2). The design's "BOUND IN [chips]" column across all four registries has no backend source and would need either (a) a new `ownerSubsystem`-style field added to all four schemas, or (b) a derived/inferred binding (e.g. "bound where an agent that has this tool/skill/hook lives") computed client- or server-side — the derived approach mirrors how integration→subsystem membership already works today ("derived, not stored" per the roster model), which is the more consistent precedent.

### Settings (System)
- `SystemConfigSchema` (`libs/contracts/src/system/system.schema.ts`) has NO `name` (company name), `tz` (timezone), `wake` (wake word), `voice` (mood enum), `ptt` (push-to-talk), or `speak` (auto-speak-replies) fields. It DOES have `ttsVoice` (free-string voice-daemon id, different shape than a 3-value mood picker) and `chatPersona` (jarvis/concise/formal — a different axis than "voice mood"). All of `name`/`tz`/`wake`/`ptt` are wholesale-new config surface.
- `concurrency` (segmented 6/12/24) vs. real `maxConcurrentRuns` (free positive int or null) — a control-type mismatch, not a missing field.
- `motion` (reduced-motion override) has no backend counterpart — this is presentation-only, likely fine as a pure frontend/localStorage setting (no gap, just noting it needs no backend).

---

## 4. Where today's `/settings` tabs (and related config surfaces) land in the new IA

| Current tab / surface | Component | Proposed ZibbyCorp destination |
|---|---|---|
| `preferences` (locale, caffeinate) | `Screen.tsx` inline | System → Settings → GENERAL (locale is language, not in the mock's 3 groups — needs a 4th row or folds into GENERAL) |
| `gates` (global rule catalog + system floor panel) | `GateRulesSection`, `SystemFloorPanel` | Policy → Gate rules (fixed floor + per-project rules sections) |
| `tasks` (roadmap level mapping) | `LevelMappingSection` | ❓ No obvious home in the 12-section sitemap (Information Architecture §04) — closest is WORK (roadmap/task machinery is a WORK concept) but the sitemap's WORK group lists only Tasks/Task detail/New task/Chains/Goals/Projects, no "level mapping" config row. **Flag as a decision**: likely lands as a WORK → Projects (per-project roadmap tab) config panel, or a new WORK-section settings sub-page — not modeled in the design files reviewed.
| `automations` (system automations: briefing/memory-distill/pattern-extract/gap-detect/self-knowledge/agent-factory/sentinel-scan/loom-audit toggle+trigger+edit) | `AutomationsSection`, `SystemAutomationRow` | Per Information Architecture's legacy-migration table: `automations` → "ORG → Department detail → Automations tab" (i.e. split per-department, each dept's automations shown in its own detail page's Automations tab) — this directly informs Knowledge → Distillation (memory-distill/gap-detect specifically) and would similarly split sentinel-scan (→ Security dept), loom-audit (→ QA & Architecture dept), pattern-extract/self-knowledge/agent-factory (❓ no obvious single department — agent-factory in particular is cross-cutting, proposes NEW agents into the shared pool, not owned by one department) — **flag agent-factory and self-knowledge as decisions**, everything else has a clean per-department home.
| `chat` (chat persona) | `ChatSection` | ❓ Not covered by any of my 5 scoped screens. Likely System → Settings, alongside VOICE — the mock's flat settings page has no persona/tone control today, would need a 4th "CHAT"/"COO" group.
| `activity` (activity-feed group visibility) | `ActivitySection` | Activity → Live log's filter bar is the closest analog (department/agent/task filters) but "which activity KINDS show at all" (visible/grouped/hidden) is a different, coarser config than any filter modeled in the Live Log screen — ❓ likely a new settings sub-panel under System → Settings, not modeled in the design.
| `mandate` (autonomy dispatch/reply per channel) | `MandateSection` | ❓ No obvious 1:1 home in the 5 scoped screens. Closest conceptually is Policy (it's an autonomy-tier config, like gate rules) but the sitemap's POLICY group lists only Approvals/Gate rules/Learned patterns — mandate isn't explicitly named anywhere in Information Architecture. **Flag as a decision**: likely folds into Policy → Gate rules as a 4th subsection, or stays in System → Settings.
| `runtime` (tick intervals, maxConcurrentRuns, goal-verify timeout, goal-auto-resume) | `SystemSection` | System → Settings — closest existing group is GENERAL ("Concurrent agents" row already models `maxConcurrentRuns`); the rest (tick intervals, goal timeouts) are deep operational knobs with no analog in the mock's 3-group Settings page — would need a new "ADVANCED"/"RUNTIME" group, likely gated behind an expert/advanced toggle since none of this is mock-designed.
| `machine` (per-machine cloneRoot) | `MachineSection` | System → Settings, but this is explicitly gitignored/local/non-synced config — arguably shouldn't live in the same "company settings" mental model at all (❓ decision: keep it a separate, clearly-labeled "this machine only" section, don't blend with company-wide GENERAL/VOICE/THEME).
| `selfKnowledge` (drift report, read-only) | `SelfKnowledgeSection` | ❓ No home in any of the 5 scoped screens or the 12-section sitemap. Closest conceptual fit is Knowledge (it's ZIBBY's self-model) but Information Architecture's KNOWLEDGE group only lists Vault/Distillation. **Flag as a decision** — likely a new Knowledge sub-page, or folds into System as a diagnostics view.
| `system` (daemon/host/uptime/status + watcher heartbeats) | inline `InfoRow`s + `WatcherRows`, `useHealthQuery` | System → Settings (a natural "SYSTEM STATUS" or "DIAGNOSTICS" group) — not explicitly modeled in `System Screens.dc.html` (which only shows Settings + Registries, no health/status page) — **flag as a gap in the design file itself**, not just a migration question: health/uptime/watcher status has no screen anywhere in my 5 files.
| Signals registry (`/signals`, handoff signal-kind CRUD) | `features/signals` | Policy → Gate rules → Handoff rules section implicitly needs this (a signal kind is what a handoff rule's `signalKind` matches against) — the mock's Handoff rules table doesn't show a signal-kind picker/registry at all, just `from→to` + mode. **Flag as a gap**: authoring a NEW handoff rule in the real system requires picking/creating a signal kind first (`/signals/new`, `?from=` prefill flow) — the mock's "+ RULE" quick-add has no equivalent step, meaning the real authoring flow is more involved than the mock shows.
| Per-agent gate rules (`/agents/:id` → `AgentRulesSection`) | — | Org → Agent profile (per Information Architecture's ORG section: "Agent profile — current subtask, tools, history, session") — outside my scope (Activity/Policy/Knowledge/Ledger/System), but worth noting Policy → Gate rules' "per-project rules" panel and an agent's own rules are TWO separate rule surfaces today that the mock's single Policy page doesn't reconcile — likely both need representation, possibly the agent-level one stays on the (out-of-scope) Agent profile page as today.
| System automations toggle (global) | `SystemFloorPanel`(?)/`AutomationsSection` | See `automations` row above — mirrors the same per-department split.
| Machine actions (N5 dry-run/execute) | `features/machine` (queries/mutations only, consumed where?) | ❓ Not modeled anywhere in the 5 scoped design files at all. Per `03-backend-domain.md`, this is explicitly "nice-to-have, later, lowest priority" (North Star doc) — reasonable that it's absent from a first design pass, but flag it has literally no home yet in the new IA.

---

## 5. Reusable UI components needed

Cross-referenced against the existing `libs/design-system/src/components/*` inventory (Accordion, Alert, Button, ButtonGroup, Card, Checkbox, Chip, CodeBlock, Container, Dialog, Divider, Dropdown, DropDownButton, DropZone, EntityHero, FilePreview, FloatingPanel, Grid, HoldButton, Icon, IconTile, Kbd, List, LivingGlow, Markdown, MarkdownEditor, MenuButton, MenuSurface, OrbitLoader, Panel, Pressable, Progress, ProgressRing, SearchBar, SearchInput, SearchMenu, Spacer, Sparkline, Stack, Stat, StatusDot, Surface, Tabs, Tag, Toggle, Tooltip, Typography — plus `immersive/*` for the orb map). None of the following exist today and are needed across these 5 screens:

1. **DataTable** (Live log, Runs, Approvals queue+history, Registries, Budgets dept table, Spend dept table) — a generic grid-templated header+rows table: `columns: {key, label, width, align}[]`, `rows: T[]`, optional `onRowClick`, optional per-cell renderer, sticky mono-10-uppercase header row, `--line` row dividers. The single biggest missing primitive — 7 of the 13 screens/states in this scope use hand-rolled CSS-grid tables that should collapse onto one component.
2. **FilterBar** (Live log's dept/agent/task selects + pause/clear; Runs' state segmented control; Gate rules' project-tab segmented control) — a row of label+control filter groups, mixed `<select>`/segmented-control children, with a trailing action-button slot.
3. **SegmentedControl** (AUTO/ASK toggles throughout Policy; Settings' concurrency/voice/theme/motion rows; Registries tabs) — DS has `Tabs` and `ButtonGroup` which may already cover this; confirm whether either matches the "2–4 option, `--ink`-fill-on-select, mono 10" visual spec exactly or needs a dedicated `Segmented` component. Likely 🔁 (extend/reuse existing) rather than 🆕.
4. **LiveLogStream** (Live log panel) — a scrolling/capped event-line list with newest-first ordering, per-line state-dot + mono columns, a blinking caret on the newest line, pause/resume semantics, and a client-side ring buffer — this is bespoke enough (animation, caret, streaming semantics) to warrant its own component rather than a DataTable variant.
5. **MetricStrip** (Runs detail, Distillation run detail — "3 columns between top/bottom hairlines") — `{label, value}[]` fixed-column row with tabular-nums values; recurs identically in both screens (and per `ZibbyCorp Design System.md` §8 "Inspector" component spec — this is a documented, named pattern already).
6. **BudgetMeter** (Budgets cap cards, Spend meters) — a card with label/pct header, big value, thin progress bar (optionally with warn/stop tick markers overlaid), and a caption — two variants needed: simple (Budgets) and dual-threshold (Spend). `Progress`/`ProgressRing`/`Stat` exist in DS but not composed into this exact card shape with tick-marker overlays — likely a new composite built from existing primitives (🔁 compose, not build from scratch).
7. **DeptSpendBar** (Spend "by department" list, Budgets "today" column) — a label+horizontal-bar+value row, repeated per department; a thin wrapper, possibly foldable into DataTable's per-cell renderer rather than its own component.
8. **ApprovalCard/Row** — already spec'd in `ZibbyCorp Design System.md` §8 ("Approval card (NEEDS YOU)") as a named component with a defined anatomy (glyph+name+id·dept+wait, request text, APPROVE/DENY/→ actions) — needs building; the Policy → Approvals queue table is a DENSER row variant of the same data, so likely two presentations (card for a rail/inbox context elsewhere in the app, row for this table) sharing one data shape.
9. **DiffViewer / ArtifactPreview** (implied by `Approval.diff[]` in the mock, and Information Architecture Flow B's "shows the diff or artifact") — no DS component renders a unified diff, a draft-text preview, or a PR stat line today (`CodeBlock` exists for plain code display, not diff-hunk coloring). Needed for the (currently-external/shared) approval detail sheet, not this file's own screens, but flagged since the queue row wires to it.
10. **RuleRow** (Handoff rules, per-project rules, gate-rule catalog) — `from→to` chips / action-pattern text + a mode toggle + optional edit/delete — `RuleCard` (`features/gates/components/RuleCard.tsx`) already exists for the richer agent/global rule model; the mock's simpler `{pattern, mode}` row is a lighter-weight sibling, not a replacement.
11. **PatternCard** (Learned patterns) — header meta row, big suggestion sentence, an evidence "cell strip" (reusing the DS-documented `dot` primitives from `zibby.js`'s `B.dot`), evidence caption, accept/dismiss actions — novel composite, no existing analog.
12. **NoteReader / WikiLinkText** (Vault) — a text renderer that tokenizes `[[wikilink]]`/`[[target|label]]` syntax into clickable spans inline with plain prose — DS `Markdown` may already do this (needs checking — real `/memory`'s `NoteView.tsx` presumably already solves this problem since the real vault is wikilink-based) — likely 🔁 reuse from `NoteView`, not build new.
13. **FolderNav / TreeList** (Vault left rail) — grouped, searchable note-title list with per-group counts — DS `List` may cover the list part; the grouped-header + search-filter combination is likely a light composite, not a new primitive.
14. **RegistryTable** (Registries) — a DataTable variant whose last column is a wrapping row of clickable Chip-like "bound-in" pills (`Chip`/`Tag` already exist in DS) — likely DataTable + `Tag` composition, not a new primitive.
15. **BriefingDocument** (Briefings) — the sectioned document layout (label+items grid rows, corner-bracket panel, read-aloud control) — `Panel` + corner-bracket treatment (documented in the design system as a reusable "focus object" framing device, not yet a component) is the base; a **CornerBrackets** decorator/wrapper component is worth extracting on its own since it recurs on Vault's article panel too and is explicitly named in the design system doc (§6).
16. **ThresholdSlider** (Spend) — a labeled range input with a live percentage readout and caption — thin wrapper over a native `<input type=range>`; check whether DS has a Slider primitive already (not seen in the component list above — likely 🆕, small).

---

## Key files referenced
- Design source: `design/ZibbyCorp/Activity Screens.dc.html`, `Policy Screens.dc.html`,
  `Knowledge Screens.dc.html`, `Ledger Screens.dc.html`, `System Screens.dc.html`,
  `zc-data.js`, `zibby.js`, `ZibbyCorp Design System.md`, `Information Architecture.dc.html`
- Contracts: `libs/contracts/src/approvals/approval.schema.ts`,
  `libs/contracts/src/gates/gate.schema.ts` + `gate.contract.ts` + `gate-rules.contract.ts`,
  `libs/contracts/src/handoff/handoff.schema.ts`,
  `libs/contracts/src/budget/budget.schema.ts` + `budget.contract.ts`,
  `libs/contracts/src/limits/limits.schema.ts` + `limits.contract.ts`,
  `libs/contracts/src/memory/memory.schema.ts` + its contract,
  `libs/contracts/src/briefing/briefing.schema.ts` + its contract,
  `libs/contracts/src/review-learning/review-rule.schema.ts` + `review-learning.contract.ts`,
  `libs/contracts/src/self-knowledge/self-knowledge.schema.ts` + its contract,
  `libs/contracts/src/monitors/monitor.schema.ts`,
  `libs/contracts/src/channels/channel.schema.ts`,
  `libs/contracts/src/tasks/task-run.schema.ts`,
  `libs/contracts/src/mcp/mcp.schema.ts`, `libs/contracts/src/skills/skill.schema.ts`,
  `libs/contracts/src/hooks/hook.schema.ts`, `libs/contracts/src/commands/command.schema.ts`,
  `libs/contracts/src/system/system.schema.ts`
- Web: `apps/web/features/archive/components/ArchiveRow.tsx`,
  `apps/web/features/gates/components/RuleCard.tsx` (+ `GateRulesSection.tsx`,
  `SystemFloorPanel.tsx`, `RuleModal.tsx`), `apps/web/features/memory/components/*`
- DS: `libs/design-system/src/components/*` (component inventory), no Table/Meter/Diff/Slider primitives found
- Prior research: `02-web-routes.md` (§2–4, 7–8), `03-backend-domain.md` (§1–3, 7)
