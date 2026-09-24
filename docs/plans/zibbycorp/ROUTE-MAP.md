# ZibbyCorp — route, settings and feature relocation map

This is the spec for Part B ("přesouvání stránek, logiky, nastavení"). Every current
route, settings tab and orphan feature has exactly one new home.

The route group is `apps/web/app/(company)/`. It replaces `(dashboard)` in ZB-01.

## 1. New route tree

The design reference for each area:

| Area | Design file |
|---|---|
| Shell | `ZibbyCorp App.dc.html` |
| ORG | `Org Screens.dc.html` |
| WORK | `Work Screens.dc.html` |
| ACTIVITY | `Activity Screens.dc.html` |
| POLICY | `Policy Screens.dc.html` |
| KNOWLEDGE | `Knowledge Screens.dc.html` |
| LEDGER | `Ledger Screens.dc.html` |
| SYSTEM | `System Screens.dc.html` |

| Section | Route | Screen | Built from (current code) | Phase |
|---|---|---|---|---|
| ORG | `/org` | Org map: CEO → COO → 11 department nodes, plus a focus panel | `useDepartmentsQuery` (was subsystems with status) + roster | ZB-02 |
| | `/org/departments/[id]` → redirects to `/team` | Department detail header: code, name, mandate, 4 KPIs | ex-`SubsystemDrawer` | ZB-03 |
| | `/org/departments/[id]/team` | That department's agents | roster endpoint | ZB-03 |
| | `/org/departments/[id]/subtasks` | Subtasks where department = id | tasks read model (ZB-04) | ZB-04 |
| | `/org/departments/[id]/pipelines` | That department's pipelines (PipelineStepStrip); card → `/org/departments/[id]/pipelines/[pid]` | `features/pipelines` (editor = existing PipelineCanvas) | ZB-03 |
| | `/org/departments/[id]/handoff` | IN/OUT handoff rules + signals (read-only, link to Policy) | ex-drawer Handoff tab | ZB-03 |
| | `/org/departments/[id]/skills` · `/integrations` · `/automations` · `/hooks` | Derived "bound in" lists (O-09, D-011); automations = department-owned ones | `features/{skills,integrations,automations,hooks}` | ZB-03 |
| | `/org/people` | Employee directory: grouped by department, filters for state and role | `/agents` catalog | ZB-03 |
| | `/org/people/[id]` | Agent profile: hero glyph, state, current subtask + live log (SSE), config, gate rules | `/agents/[id]` DetailScreen + RunLogStream | ZB-03 |
| | `/org/people/new` | Create agent (department required) | agent create flow | ZB-03 |
| WORK | `/work/tasks` | Parent tasks table: filters for company, project, department, state and source; chain strip per row | `/archiv` + ChatTasksPanel | ZB-04 |
| | `/work/tasks/[id]` | Task detail: chain route strip, subtasks, runs, artifacts, approvals | RunDetail / ChatTaskDetailColumn | ZB-04 |
| | `/work/tasks/new` | New task: entry (COO / department), project, chain override, route preview, attachments, paths | NewTaskProvider / CommandLine | ZB-04 |
| | `/work/chains` · `/work/chains/[id]` · `/work/chains/new` | Chain library and editor (D-005) | new UI over the handoff controller | ZB-05 |
| | `/work/goals` · `/work/goals/[id]` | Goals (hooks exist, no screen today) | `features/goals` | ZB-06 |
| | `/work/companies` (+ `/[id]`, `/new`) | Companies | `/companies/*` | ZB-06 |
| | `/work/teams` (+ `/[id]`, `/new`) | Teams (D-003) | `/teams/*` | ZB-06 |
| | `/work/projects` (+ `/[id]/[tab]`, `/new`, `/[id]/integrations/[integrationId]`) | Projects; **the real tabs are kept**: overview/profile/secrets/integrations/roadmap | `/projects/*` | ZB-06 |
| ACTIVITY | `/activity/log` | Live log (activity SSE, filters) | ChatLiveLog + activity feed | ZB-07 |
| | `/activity/runs` · `/activity/runs/[runId]` | Every run (search, state filter, infinite scroll) | `/archiv` + `/runs` shim | ZB-07 |
| | `/activity/inbox` | Inbound channel items (mine-and-mentions), triage outcome, tier | channels / inbox feature | ZB-07 |
| | `/activity/briefings` | Briefing document + read-aloud | `features/briefing` | ZB-07 |
| POLICY | `/policy/approvals` | Queue and history; the sheet opens via `?approval=<id>` | approvals feature | ZB-08 |
| | `/policy/gates` | Floor (locked) · Global rules · Per-project · Per-agent (links) · Handoff rules · Signals · Mandate | `settings/gates`, `/signals`, `settings/mandate` | ZB-08 |
| | `/policy/patterns` | Learned patterns = review-learning rules (O-10) | review-learning | ZB-08 |
| KNOWLEDGE | `/knowledge/vault` (`?note=`) | Vault: tier and department-shelf nav, note reader with wikilinks | `/memory` | ZB-09 |
| | `/knowledge/distill` | Distillation runs (memory-distill / gap-detect) + Self-model (self-knowledge drift) | settings automations + selfKnowledge | ZB-09 |
| LEDGER | `/ledger/budgets` | Global + per-project + per-company budgets, with a department column (O-06) | budget feature | ZB-10 |
| | `/ledger/spend` | 5h / week limits, warn and stop thresholds (O-08), spend by department | limits + budget | ZB-10 |
| SYSTEM | `/system/settings/[section]` | See § 3 | `features/settings` | ZB-11 |
| | `/system/registries/[kind]` (+ `/[id]`, `/new`) where kind = skills \| mcp \| hooks \| commands | Global libraries with derived "bound in" | `/skills` `/mcp` `/hooks` `/commands` | ZB-11 |

**Shell (every route), ZB-01 and ZB-12:**
- **Header:** wordmark, section nav, operator ("CEO") name, active-run count,
  5H/WEEK bars (ex-LimitsRings), ⌘K trigger, ⚙ → `/system/settings`.
- **Sub-nav:** the section's tabs, plus a global `+ NEW TASK`.
- **Left rail:** NEEDS YOU, i.e. pending approvals as ApprovalCards.
- **COO dock:** a floating chat composer (ex-`/chat` ChatDock engine) with voice.
- **⌘K:** CommandPalette (ex-ChatSearch index, broadened).

## 2. Old route → new route (permanent redirects, D-009)

| Old | New |
|---|---|
| `/` | `/org` |
| `/chat` | `/org` (the chat engine lives in the dock) |
| `/agents` · `/agents/[id]` | `/org/people` · `/org/people/[id]` |
| `/pipelines` · `/pipelines/[id]` | `/org/departments/[dept]/pipelines/[id]`; the redirect resolves the department server-side via the pipelines API, falling back to `/org` |
| `/automations` · `/automations/[id]` | `/org/departments/[dept]/automations` (same resolution); system automations → `/system/settings/automations` |
| `/skills` `/mcp` `/hooks` `/commands` (+`/[id]`) | `/system/registries/<kind>(/[id])` |
| `/signals` · `/signals/new` · `/signals/[id]` | `/policy/gates?section=signals` (+ `&new=1` / `&id=`) |
| `/companies/*` · `/teams/*` · `/projects/*` | `/work/companies/*` · `/work/teams/*` · `/work/projects/*` |
| `/memory` | `/knowledge/vault` |
| `/archiv` · `/runs` | `/activity/runs` |
| `/settings` (+ `?tab=`) | `/system/settings/<section>` per § 3 |

## 3. Today's `/settings` tabs → new homes

| Current tab | New home |
|---|---|
| preferences (locale, caffeinate) | `/system/settings/general` (+ LangSwitch) |
| gates (catalog + floor) | `/policy/gates` |
| tasks (roadmap level mapping) | `/work/projects/[id]/roadmap` → "Level mapping" panel; the global default goes to `/system/settings/general` |
| automations (system automations) | `/system/settings/automations`. Each row also appears read-only on its owning department's Automations tab: security-scan → SEC, arch-audit → QA, memory-distill/gap-detect → KNW, briefing → COM. agent-factory, self-knowledge and pattern-extract have no department. |
| chat (persona) | `/system/settings/coo` |
| activity (feed visibility) | `/system/settings/activity` |
| mandate | `/policy/gates?section=mandate` |
| runtime (ticks, maxConcurrentRuns, goal timeouts) | `/system/settings/runtime` (the "Advanced" group) |
| machine (cloneRoot) | `/system/settings/machine`, clearly labelled "This machine only" |
| selfKnowledge | `/knowledge/distill` → Self-model |
| system (health, watchers) | `/system/settings/status` |
| (new) appearance | `/system/settings/appearance`: theme light/dark/system, reduced motion |

## 4. Orphans (implemented today, absent from the design) — O-14

| Feature | Home |
|---|---|
| Pins | A star on People cards, the agent profile header and pipeline cards; pinned items sort first in the directory. |
| Roadmap board (Jira/GitHub sync, autoPlay) | `/work/projects/[id]/roadmap`, unchanged logic |
| LangSwitch | `/system/settings/general` |
| LimitsRings | Header 5H/WEEK bars (same `useLimitsQuery`) |
| StatusPill + StatusFlyoutPanel | **Retired** — the NEEDS YOU rail and the header active count replace them |
| ChatLiveLog (floating) | **Retired** — `/activity/log`; the dock shows the latest line collapsed |
| BootSplash + LoadingScreen | DS `Splash` (choreographed glyph walk, `ZibbyCorp Splash.dc.html`) |
| Orb map / immersive shell | **Deleted** (O-26) |
| Machine ops (N5 dry-run) | No UI; stays chat-tool only (lowest priority per the North Star) |
| Task attachments / path grants / @-mentions | Kept in New task and in the dock composer |
| Run stop/resume | Buttons on `/activity/runs/[runId]` and on the Task detail runs panel |
| Goal loop controls | `/work/goals/[id]` |
| Subsystem handoff "Předávání" mad-libs editor | `/policy/gates?section=handoff` (reused, re-skinned) |
| Per-agent gate rules (AgentRulesSection) | `/org/people/[id]` → Rules panel, and linked from `/policy/gates` |
