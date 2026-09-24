# Web app route map — z.i.b.b.y (`apps/web`)

Researched 2026-09-24 for the "company" metaphor redesign. All paths relative to
repo root `/Users/zibby/Workspace/z.i.b.b.y` unless noted.

---

## 0. Top-line orientation

The app went through an **HUD → Chat UI migration** (see memory arc
`project_hud_to_chat_migration_arc.md`, docs under `docs/hud2chat/`). The result:

- **Every route renders fullscreen/"immersive"** — there is no persistent sidebar,
  topbar-with-nav, or rail chrome any more. `AppShell` (`apps/web/components/layout/AppShell/AppShell.tsx`)
  explicitly documents this: `MainLayout`, `Sidebar`, `RightRail`, classic `TopBar`
  and the `FULLSCREEN_ROUTES` table are **all deleted**. **This directly
  contradicts the "Routing" section of the root `CLAUDE.md`**, which still
  describes `AppShell` as wrapping `MainLayout` with nav/rail/voice/task slots —
  that doc is stale (see §8).
- `/chat` is home (`app/page.tsx` redirects `/` → `/chat`). It is a JARVIS-style
  "Velín-D" HUD: a `SubsystemOrbMap` filling the screen, a 56px glass `ChatTopBar`,
  a floating `ChatToolDock` (the *only* persistent nav surface left), a bottom
  `ChatBottomBar` (chat/task/note composers), a bottom-right `ChatLiveLog`, and a
  left `ChatTasksPanel` gutter.
- Every other route is a standalone full-page `ImmersiveShell` (via the app-level
  `ImmersivePage` wrapper) with a round back button (→ `/chat` by default).
- Navigation between routes happens via: (a) the `ChatToolDock` icon rail (12 links
  + settings), (b) `ChatSearch` (⌘K inline search, a different, narrower index),
  (c) card clicks inside a list screen, (d) the `ChatTasksPanel`'s "Archiv · N" link.
  **There is no site-wide nav item for `/chat` itself, `/archiv`, `/runs`** (deleted
  redirect shim), or company/team creation flows beyond their own list screens.

---

## 1. Full route tree (`apps/web/app`)

Route group: `(dashboard)`, wrapped by `app/(dashboard)/layout.tsx` → `<AppShell>`.
`app/layout.tsx` is the root server layout (fonts, `NextIntlClientProvider`,
`<Providers>`). `app/page.tsx` is `redirect("/chat")`. `app/(dashboard)/loading.tsx`
is a generic `OrbitLoader` fallback.

All pages are **thin** (5–15 lines): they import a `Screen`/`DetailScreen` from
`apps/web/features/<domain>` and pass route params through. Every list `Screen` and
`DetailScreen` composes `ImmersivePage` (`apps/web/components/layout/ImmersivePage/ImmersivePage.tsx`,
a thin app wrapper around DS `ImmersiveShell` with a back-link + translated tooltip).

| Route | File | Feature module | Purpose | Create/Edit/Delete actions | Tabs (via `?tab=`) |
|---|---|---|---|---|---|
| `/` | `app/page.tsx` | — | `redirect("/chat")` | — | — |
| `/chat` | `app/(dashboard)/chat/page.tsx` → `features/chat/Screen.tsx` → `ChatScreen` | `features/chat` | Home: conversational core, subsystem orb map, task gutter, live log | Send chat msg, run-a-task, add-a-note, generate briefing, stop/resume/delete a run, approve inline | — |
| `/agents` | `features/agents/Screen.tsx` | `features/agents` | Agent catalog, grouped by category | Create agent (dialog), create/delete category | — |
| `/agents/[id]` | `features/agents/DetailScreen.tsx` | `features/agents` | Agent detail — basics + gate rules editor | Edit (inline, top-right Save), Delete (confirm dialog) | — |
| `/pipelines` | `features/pipelines/Screen.tsx` (master list) | `features/pipelines` | Pipeline catalog + node-graph canvas editor | Create pipeline (dialog), duplicate, run (task composer) | — |
| `/pipelines/[id]` | `features/pipelines/Screen.tsx` with `selectedId` prop | `features/pipelines` | Same screen, master-detail (not a separate `DetailScreen`) — selected pipeline's canvas opens | Edit graph inline, delete, run | — |
| `/automations` | `features/automations/Screen.tsx` | `features/automations` | **Operator's own** automations only (`!a.system` filter — system automations moved to Settings→Automations) | Create (dialog), trigger now, toggle | — |
| `/automations/[id]` | `features/automations/DetailScreen.tsx` | `features/automations` | Edit surface: 3 shapes keyed on `automation.system` × `automation.target.type` | Edit, trigger, delete | — |
| `/commands` | `features/commands/Screen.tsx` | `features/commands` | Slash-command catalog (tiles) | Add (modal) | — |
| `/commands/[id]` | `features/commands/DetailScreen.tsx` | `features/commands` | Edit command (id/desc/argHint/allowedTools/model/instructions, zod-validated form) | Edit, delete | — |
| `/hooks` | `features/hooks/Screen.tsx` | `features/hooks` | Hook catalog | Create (dialog) | — |
| `/hooks/[id]` | `features/hooks/DetailScreen.tsx` | `features/hooks` | Edit hook | Edit, delete | — |
| `/mcp` | `features/mcp/Screen.tsx` | `features/mcp` | MCP server catalog | Create (dialog) → redirects to detail | — |
| `/mcp/[id]` | `features/mcp/DetailScreen.tsx` | `features/mcp` | Edit server (id/transport locked); separate out-of-band credentials mutation | Edit, set credentials, test(?), delete | — |
| `/signals` | `features/signals/components/SignalsScreen.tsx` | `features/signals` | Handoff signal-kind registry | Create → `/signals/new` | — |
| `/signals/new` | `features/signals/components/SignalCreateScreen.tsx` | `features/signals` | Guided signal-kind creator; `?from=` prefills producer (deep-linked from handoff rule editor) | Create | — |
| `/signals/[id]` | `features/signals/components/SignalDetailScreen.tsx` | `features/signals` | Signal-kind detail | Edit, delete | — |
| `/memory` | `features/memory/Screen.tsx` | `features/memory` | Force-directed wiki-link graph over the real Obsidian vault, note viewer/editor, index-first search, tier filter (`all/memory/daily/knowledge`) | Create/edit note (dialog), import | — |
| `/projects` | `features/projects/Screen.tsx` | `features/projects` | Project catalog, categorized, with live budget bars per `ProjectCard` | Create category, create project → `/projects/new` | — |
| `/projects/new` | `features/projects/ProfileScreen.tsx` (no id) | `features/projects` | New-project basics editor only | Create → redirects to `/projects/:id` | — |
| `/projects/[id]` | `features/projects/ProfileScreen.tsx` | `features/projects` | Project detail — the richest screen in the app | Edit basics/budget/prOpenMode, delete, clone project, set/clear secrets, link/unlink company & team | **overview, profile, secrets, integrations, roadmap** |
| `/projects/[id]/integrations/[integrationId]` | `features/integrations/DetailScreen.tsx` | `features/integrations` | One integration's config + credentials + test | Edit, set credentials, test connection, delete | — |
| `/companies` | `features/companies/Screen.tsx` | `features/companies` | Company catalog | Create → `/companies/new` | — |
| `/companies/new` | `features/companies/DetailScreen.tsx` (no id) | `features/companies` | New-company basics only (roster unlocks after create) | Create → redirects to `/companies/:id` | — |
| `/companies/[id]` | `features/companies/DetailScreen.tsx` | `features/companies` | Company detail: basics + **people roster** (name/role/comms_style/vip) + linked-projects (reverse lookup) | Edit basics, add/edit/remove person, link project (dialog), delete company | — |
| `/teams` | `features/teams/Screen.tsx` | `features/teams` | Team catalog — "the layer between Company and Project" | Create → `/teams/new` | — |
| `/teams/new` | `features/teams/DetailScreen.tsx` (no id) | `features/teams` | New-team basics only | Create → redirects to `/teams/:id` | — |
| `/teams/[id]` | `features/teams/DetailScreen.tsx` | `features/teams` | Team detail: basics (name/desc/companyId) + read-only knowledge base + linked-projects reverse lookup. **No people roster, no budget** (deliberately company-only) | Edit basics, edit knowledge-base sources, link project, delete team | — |
| `/settings` | `features/settings/Screen.tsx` | `features/settings` | System-wide configuration hub | See §4 table | **preferences, gates, tasks, automations, chat, activity, mandate, runtime, machine, selfKnowledge, system** |
| `/archiv` | `features/archive/Screen.tsx` | `features/archive` | Task/run archive — search + subsystem filter + infinite list; `?run=` opens a run's detail inline | Stop/resume/delete a run | — |
| `/runs` | `app/(dashboard)/runs/page.tsx` | — | **Redirect shim only** — `redirect(run ? "/archiv?run=..." : "/archiv")`. Kept alive because old chat-transcript JSONL on disk still embeds `/runs?run=` links (D17 decision); no retention policy yet to delete it | — | — |

Notes:
- `/projects/new` and `/companies/new`/`/teams/new` all reuse the `[id]`-taking
  detail screen with `id` omitted — Next's static segment (`new`) wins over the
  dynamic one by routing precedence, not by any special-casing in the file tree.
- `pipelines` is the one list screen with **no separate `DetailScreen`** — master/
  detail lives inside one `Screen.tsx`, selected via a `selectedId` prop.
- No route exists yet for "goals" (`features/goals` is query/mutation hooks only,
  consumed elsewhere — no dedicated screen) — see §8.

---

## 2. App shell, chrome, and navigation

### Root layout / providers
- `apps/web/app/layout.tsx` — server layout: Geist + JetBrains Mono fonts,
  `NextIntlClientProvider`, wraps `<Providers>`.
- `apps/web/app/providers.tsx` (`"use client"`) — `QueryClientProvider` (30s
  staleTime, no refetch-on-focus, a global `MutationCache.onError` → toast, so
  every failed mutation is surfaced) → ts-rest `apiClient.ReactQueryProvider` →
  `RunEventsProvider` (SSE bus, `features/runs/runEvents.tsx`) → DS
  `DesignSystemProvider theme="dark"` → `BootSplash` → `Toaster`.
- `apps/web/components/layout/BootSplash/BootSplash.tsx` — animated boot splash,
  min-visible floor (default 600ms), crossfades out once "ready" (currently just
  hydration) — renders the app underneath the whole time so it warms up.

### Dashboard shell
- `apps/web/app/(dashboard)/layout.tsx` → `AppShell` (`components/layout/AppShell/AppShell.tsx`).
  Mounts, outer→inner: `CatalogProvider` (`state/store.tsx`) → `SkipLink` (first
  focusable element, targets DS `MAIN_CONTENT_ID`) → `NewTaskProvider`
  (`features/tasks`) → `ChatProvider` (`features/chat`) → `Suspense` →
  `AppShellInner` (a `Container height="100dvh" overflow="hidden"`, no chrome).
- `apps/web/components/layout/ImmersivePage/ImmersivePage.tsx` — every non-chat
  route's wrapper: DS `ImmersiveShell` + a `next/link` round back button (default
  `/chat`) with translated aria-label/tooltip. ~14 call sites per its own doc
  comment.

### `/chat` chrome (`apps/web/features/chat/components/`)
- `ChatScreen.tsx` — root composition: ambient radial backdrop + scanline/grid
  overlays (raw inline styles, explicitly sanctioned `react/forbid-dom-props`
  escape hatch) → `ChatTopBar` → `ChatToolDock` (absolute top-right) →
  `SubsystemOrbMap` (fills page, insets reserve room for top bar / bottom chrome)
  → left `ChatTasksPanel` gutter (hidden below `lg`) → `SubsystemDrawer` (modal,
  opens on orb click) → `ChatTaskDetailColumn` (modal, opens on task-panel click)
  → `ChatBottomBar` (bottom-center, chat/task/note composers) → `ChatLiveLog`
  (bottom-right) → `ChatDetailDialog` (search result detail) → `CoreOverviewDialog`
  (central-orb click → whole-federation snapshot, lets you jump into a subsystem
  drawer from there too).
- `ChatTopBar.tsx` — CSS-grid `auto 1fr auto` row, 56px fixed height. Left:
  `StatusPill` (+ hover/click flyout, `StatusFlyoutPanel.tsx` — sections built
  from `useApprovalsQuery`, `useRunsQuery`, `useSubsystemsQuery`; rows =
  `FlyoutApprovalRow` / `FlyoutErrorRow` / `FlyoutWorkRow`). Center: `ChatSearch`.
  Right: `LimitsRings` (Claude 5h/weekly usage gauge, `components/layout/LimitsRings/`)
  + `LangSwitch`. A former 5th "switch to HUD" element was **removed outright**
  once `/overview` (its destination) was deleted — see §8.
- `ChatSearch.tsx` — the ⌘K inline top search (`ChatScreen` binds the global
  keydown listener). Builds a **client-side flat index** from live query hooks:
  agents, pipelines, subsystems, running tasks (`useRunsQuery`), skills, MCP
  servers, projects, commands, companies, plus a static "settings" row and a
  synthetic "generate briefing" action row; memory is server-searched separately
  (`useMemorySearchQuery`). **Does NOT index teams, automations, hooks, signals,
  or archive** — those are reachable only via `ChatToolDock` or direct nav (see
  §8). Result cap 30. Picking an agent/pipeline opens a read-only detail dialog
  inline; subsystem/task picks open the in-chat drawer/column; everything else
  navigates away via `router.push`.
- `ChatToolDock.tsx` — the **only persistent nav surface** in the app: a
  vertical glass pill of icon links, `DOCK_IDS = [companies, teams, projects,
  agents, pipelines, skills, commands, mcp, hooks, signals, automations, memory]`
  (12 items, all pulled from `state/config.ts`'s `NAV_ITEMS`) + a divider +
  Settings. `/chat`, `/archiv`, `/runs` deliberately have no dock entry (reached
  by other means — see §0/§8).
- `ChatBottomBar.tsx` / `ChatDock.tsx` — the chat/task/note composer row; owns the
  only live chat stream (`useChatStream`) and bridges an `onStreamingChange` up to
  drive the orb map's "thinking" pulse.
- `ChatLiveLog.tsx` — bottom-right collapsible activity feed widget (reuses old
  HUD RightRail data wiring).
- `SubsystemOrbMap.tsx` — the ellipse-of-orbs visualization: central "core" orb +
  11 subsystem mini-orbs (see §5), colored/animated by live subsystem state, fed
  agent/pipeline/run catalogs to compute per-subsystem active-run counts via
  `ownerSubsystem`.
- `StatusPill.tsx` + `StatusFlyoutPanel.tsx` — segmented status pill (working /
  needs-attention / error sections per `statusFlyout.ts`'s `SECTION_META`); hover
  or click opens a flyout portal with per-section rows.

### Route table / static config
- `apps/web/state/config.ts` — `NAV_ITEMS` (12 entries, id/glyph/href, labels
  resolved from `nav.<id>` i18n keys at render time), `SETTINGS_ITEM`,
  `MODEL_OPTIONS`, `THINKING_OPTIONS`, `AGENT_GLYPHS`, `AGENT_TOOLS`. Explicitly
  documents that `/chat` and `/archiv` carry no nav-rail entry of their own.

### Other shared layout components
- `components/layout/SkipLink/SkipLink.tsx` — a11y skip-to-content, mounted once
  in `AppShell`.
- `components/layout/LimitsRings/` — Claude usage gauge (`LimitsRings.tsx`,
  `RingWithLabel.tsx`, `PopoverRow.tsx`, `formatResetIn.ts`).
- No drawers besides `SubsystemDrawer` (subsystem detail, modal/`position:fixed`)
  and `ChatTaskDetailColumn` (task detail, same treatment) — both escape the
  page's stacking context on their own as of Phase 125/126.

---

## 3. `apps/web/features/*` inventory

(29 domain folders under `apps/web/features/`.) For each: components / queries /
mutations dirs present, and which route(s) consume it.

| Domain | Has components/ | Has queries/ | Has mutations/ | Consuming route(s) |
|---|---|---|---|---|
| `activity` | — | — | — | Settings→Activity tab; `ChatLiveLog` |
| `agents` | ✅ | ✅ | ✅ | `/agents`, `/agents/[id]`, `ChatSearch`, `/pipelines` (agent palette) |
| `approvals` | — | ✅ | (likely) | `StatusFlyoutPanel`, `/chat` inline approval |
| `archive` | ✅ | ✅ | — | `/archiv` |
| `artifacts` | — | — | — | `SubsystemDrawer` Artefakty tab |
| `automations` | ✅ | ✅ | ✅ | `/automations`, `/automations/[id]`, Settings→Automations |
| `briefing` | — | — | ✅ (`useGenerateBriefingMutation`) | `/chat` (top bar + ⌘K action) |
| `chat` | ✅ (large — 30+ components) | ✅ | ✅ | `/chat` |
| `commands` | ✅ | ✅ | ✅ | `/commands`, `/commands/[id]`, `ChatSearch` |
| `companies` | ✅ | ✅ | ✅ | `/companies`, `/companies/[id]`, `/companies/new`, `ChatSearch`, `ProjectCompanyPanel` |
| `gates` | ✅ | ✅ | ✅ | `/agents/[id]` (`RuleModal`, `AgentRulesSection`), Settings→Gates (`GateRulesSection`), `SubsystemDrawer` Gates tab |
| `goals` | — | ✅ | ✅ | Consumed elsewhere (roadmap auto-pickup / goal loop) — **no dedicated screen** |
| `graphify-out` | — | — | — | (build artifact dir, not app code — see §8) |
| `handoff` | ✅ | ✅ | ✅ | `SubsystemDrawer` Handoff tab, `/signals` (signal-kind CRUD lives here too) |
| `health` | — | — | — | Settings→System tab (`useHealthQuery`), `ChatTopBar`(?) |
| `hooks` | ✅ | ✅ | ✅ | `/hooks`, `/hooks/[id]`, `ChatToolDock` |
| `integrations` | ✅ | ✅ | ✅ | `/projects/[id]?tab=integrations`, `/projects/[id]/integrations/[integrationId]`, Settings→Mandate |
| `limits` | — | — | — | `LimitsRings` |
| `machine` | — | ✅ | ✅ | Settings→Machine tab |
| `maestro` | — | — | — | (Maestro subsystem's own backend integration; no dedicated web screen found) |
| `mcp` | ✅ | ✅ | ✅ | `/mcp`, `/mcp/[id]`, `ChatSearch` |
| `memory` | ✅ | ✅ | — (writes via note editor mutations, colocated) | `/memory`, `ChatSearch` |
| `pins` | ✅ (`PinButton`) | ✅ | ✅ | `/agents/[id]`, `/pipelines` (pin an agent/pipeline) |
| `pipelines` | ✅ | ✅ | ✅ | `/pipelines`, `/pipelines/[id]`, `ChatSearch` |
| `projects` | ✅ | ✅ | ✅ | `/projects`, `/projects/[id]`, `/projects/new`, `ChatSearch` |
| `roadmap` | ✅ | ✅ | ✅ | `/projects/[id]?tab=roadmap`, `/projects/[id]?tab=integrations` (automation panel), Settings→Tasks (level mapping) |
| `runs` | ✅ (components) | ✅ | (via `useRunActions`) | `/chat` (tasks panel, run detail column), `/archiv`, `ChatSearch` |
| `self` | — | — | — | (self-dev loop plumbing) |
| `self-knowledge` | — | ✅ | — | Settings→Self-Knowledge tab |
| `signals` | ✅ | (colocated in `handoff`) | (colocated in `handoff`) | `/signals`, `/signals/new`, `/signals/[id]` |
| `skills` | ✅ | ✅ | ✅ | `/skills`, `/skills/[id]`, `ChatSearch` |
| `subsystems` | ✅ (`SubsystemDrawer` + 5 tabs) | ✅ | ✅ (`useMarkSubsystemSeenMutation`) | `/chat` (orb map + drawer), `ChatSearch` |
| `system` | — | ✅ | ✅ | Settings→Chat, Settings→Runtime (`SystemConfig`) |
| `tasks` | ✅ (`CommandLine`, `TaskAttachments`) | (via runs) | ✅ | `NewTaskProvider` app-wide (task composer used from `/chat`, `/automations/[id]`, etc.) |
| `teams` | ✅ | ✅ | ✅ | `/teams`, `/teams/[id]`, `/teams/new`, `ChatSearch`, `ProjectTeamPanel` |

Every domain follows the CLAUDE.md-mandated split: `queries/useXQuery.ts` /
`mutations/useXMutation.ts`, one hook per file, `select: selectApiResponseBody`.

---

## 4. Settings inventory — where every knob lives

| Setting | Route + component | Backing API/contract (as imported) |
|---|---|---|
| Locale (cs/en) | `/settings` (preferences tab), `Screen.tsx` inline | Cookie only (`document.cookie`), no API |
| "Caffeinate" (keep-awake) | `/settings` (preferences), `Screen.tsx` inline | `localStorage` only, no API |
| Policy-floor gate rules (global) | `/settings?tab=gates` → `GateRulesSection` (`features/gates/components/GateRulesSection.tsx`) — also `SystemFloorPanel` | `features/gates/queries/useSystemPolicyQuery`, `useGateRulesQuery`; mutations `useCreateGateRuleMutation`, `useUpdateGateRuleMutation`, `useDeleteGateRuleMutation`, `useReorderGateRulesMutation` |
| Per-agent gate rules | `/agents/[id]` → `AgentRulesSection` + `RuleModal` | `features/gates/queries/useAgentGatesQuery`; `useReplaceAgentGatesMutation` |
| Roadmap level mapping (which Jira/GitHub state maps to which board level) | `/settings?tab=tasks` → `LevelMappingSection` (`features/roadmap/components/LevelMappingSection.tsx`) | `features/roadmap/queries/useLevelMappingQuery`; `useSetLevelMappingMutation` |
| System automations (briefing/memory-distill/pattern-extract/…) toggle+trigger+edit | `/settings?tab=automations` → `AutomationsSection` + `SystemAutomationRow` | `features/automations/queries/useAutomationsQuery` (filtered `a.system`); `useUpdateAutomationMutation`, `useTriggerAutomationMutation` |
| Chat persona (jarvis/concise/formal) | `/settings?tab=chat` → `ChatSection` | `features/system` `useSystemConfigQuery` / `useSetSystemConfigMutation` (`SystemConfig.chatPersona`) |
| Activity-feed group visibility (visible/grouped/hidden per group) | `/settings?tab=activity` → `ActivitySection` | `features/settings/queries.useActivityViewQuery`; `useSetActivityViewMutation` |
| Autonomy mandate (dispatch/reply, default + per-integration override) | `/settings?tab=mandate` → `MandateSection` | `features/settings/queries.useMandateQuery`; `useSetMandateMutation`; reads `features/integrations` `useIntegrationsQuery` for the per-channel rows |
| Runtime knobs: task/channel/monitor/automation/limit-resume/roadmap tick intervals, limit-resume max, `maxConcurrentRuns`, goal-verify timeout, goal-auto-resume | `/settings?tab=runtime` → `SystemSection` | `features/system` `useSystemConfigQuery` / `useSetSystemConfigMutation` |
| Per-machine `cloneRoot` (local checkout dir) | `/settings?tab=machine` → `MachineSection` | `features/machine` `useMachineConfigQuery` / `useUpdateMachineConfigMutation` — gitignored, never synced |
| Self-knowledge / drift report (read-only) | `/settings?tab=selfKnowledge` → `SelfKnowledgeSection` | `features/self-knowledge` `useSelfKnowledgeQuery` |
| System info (daemon/host/uptime/status) + 5 watcher heartbeats | `/settings?tab=system` → inline `InfoRow`s + `WatcherRows` | `features/health` `useHealthQuery` (10s poll) |
| Project basics: name/category/desc/logo, **budget** (daily/weekly/monthly run caps + concurrent cap + cost caps), **`prOpenMode`** (draft vs ready PRs) | `/projects/[id]` (overview tab) → `ProjectBasicsPanel` | `features/projects` `useUpdateProjectMutation` |
| Project autonomy policy | `/projects/[id]` (profile tab) → `autonomyPanel` (inline in `ProfileScreen.tsx`) | `ProjectAutonomyPolicy` type, via project update mutation |
| Project daily rhythm / standup | `/projects/[id]` (profile tab) → `rhythmPanel`, `standupPanel` | `ProjectDailyRhythm`; `useProjectStandupQuery` |
| Project secrets | `/projects/[id]` (secrets tab) → `ProjectSecretsPanel` | `useSetProjectSecretsMutation`, `useDeleteProjectSecretsMutation` |
| Project ↔ team / company linkage | `/projects/[id]` (overview tab) → `ProjectCompanyPanel`, `ProjectTeamPanel` | project update mutation (`companyId`, `teamId` fields) |
| Per-project integration config + credentials + test | `/projects/[id]/integrations/[integrationId]` → `features/integrations/DetailScreen.tsx` | `useIntegrationQuery`; `useUpdateIntegrationMutation`, `useSetCredentialsMutation`, `useTestIntegrationMutation`, `useDeleteIntegrationMutation` |
| Roadmap sync automation per project (`autoPlay`, source picker, "jen moje issues") | `/projects/[id]?tab=integrations` → `RoadmapAutomationPanel` | `features/roadmap` `useRoadmapConfigQuery` / `useSetRoadmapConfigMutation` |
| Roadmap board itself (items, sync, play/restart/resume) | `/projects/[id]?tab=roadmap` → `RoadmapPanel`/`RoadmapBoard` | `features/roadmap` `useRoadmapItemsQuery`; `useSyncRoadmapItemsMutation`, `usePlayRoadmapItemMutation`, etc. |
| Company basics + people roster (name/role/comms_style/vip) | `/companies/[id]` → `CompanyBasicsPanel` + inline `PersonRow` list | `features/companies` `useUpdateCompanyMutation` |
| Company ↔ project linking | `/companies/[id]` → `LinkProjectDialog` | `features/projects`/`companies` mutations |
| Team basics + read-only knowledge base sources | `/teams/[id]` → `TeamBasicsPanel` + `TeamKnowledgeBasePanel` | `features/teams` `useUpdateTeamMutation`; `KnowledgeBaseSource` type |
| Handoff signal-kind registry (producer/consumer catalog) | `/signals`, `/signals/new`, `/signals/[id]` | `features/handoff` `useSignalKindsQuery`; `useCreateSignalKindMutation`, `useUpdateSignalKindMutation`, `useDeleteSignalKindMutation` |
| Handoff rules (which subsystem hands off to which, on what signal) | `SubsystemDrawer` → Handoff tab → `HandoffRulesSection`/`HandoffRuleEditor` | `features/handoff` `useHandoffRulesQuery`; `useCreateHandoffRuleMutation`, `useUpdateHandoffRuleMutation`, `useDeleteHandoffRuleMutation` |
| Pin an agent/pipeline (favorite) | `PinButton` on `/agents/[id]`, `/pipelines` | `features/pins` `usePinsQuery` / `useSetPinsMutation` |

---

## 5. Entities surfaced in UI

| Entity | Catalog (list) | Detail | Create | Notes |
|---|---|---|---|---|
| **Subsystems** (11 fixed: forge, puls, sentinel, maestro, beacon, scout, herald, loom, codex, ledger, hearth — `libs/contracts/src/subsystems/subsystem.schema.ts`) | `/chat` orb map (`SubsystemOrbMap`) | `SubsystemDrawer` modal (5 tabs: **roster, aktivita, gates, handoff, artefakty**) | fixed enum, not user-creatable | Closed set by design — "ZIBBY doesn't grow a twelfth without a design decision." Each has name/tagline/mandate(Czech)/color; functions as the mythic-department layer. Agents & pipelines carry an optional `ownerSubsystem` FK. |
| **Companies** | `/companies` | `/companies/[id]` | `/companies/new` | Owns the canonical **people roster** (`ProjectPerson[]`: name, role, comms_style, vip) and budget rollups (via linked projects) |
| **Teams** | `/teams` | `/teams/[id]` | `/teams/new` | Sits between Company and Project; owns a read-only knowledge base; no roster, no budget of its own |
| **Projects** | `/projects` (categorized) | `/projects/[id]` (5 tabs) | `/projects/new` | Links to one company (`companyId`) and optionally one team (`teamId`); owns budget, autonomy policy, secrets, integrations, roadmap |
| **Agents** | `/agents` (categorized) | `/agents/[id]` | dialog on `/agents` | Optional `ownerSubsystem`; per-agent gate rules; pinnable |
| **Pipelines** | `/pipelines` | `/pipelines` w/ `selectedId` (master-detail, no separate route content) | dialog on `/pipelines` | Node-graph canvas editor (`PipelineCanvas`); optional `ownerSubsystem`; pinnable |
| **Skills** | `/skills` (categorized, tiles) | `/skills/[id]` | modal on `/skills` | zod-validated instructions editor |
| **Commands** (slash commands) | `/commands` | `/commands/[id]` | modal | — |
| **Hooks** | `/hooks` | `/hooks/[id]` | dialog | — |
| **MCP servers** | `/mcp` | `/mcp/[id]` | dialog → redirects to detail | credentials handled out-of-band from config |
| **Memory** (vault notes) | `/memory` (graph + search) | inline `NoteView`/editor dialog, no separate route | dialog | Force-directed graph, tier filter |
| **Signals** (handoff signal kinds) | `/signals` | `/signals/[id]` | `/signals/new` (guided, `?from=` prefill) | Registry consumed by Handoff rules |
| **Automations** | `/automations` (operator-owned only) | `/automations/[id]` | dialog | System automations live in Settings, not this list |
| **Runs / Tasks** | `/chat` task gutter (`ChatTasksPanel`, active only), `/archiv` (full history, infinite scroll, search, subsystem filter) | Inline modal column (`ChatTaskDetailColumn` from `/chat`; `RunDetail` inline from `/archiv`) | Created via `NewTaskProvider`/`CommandLine` task composer, not a dedicated create route | `/runs` is a dead redirect shim to `/archiv` |
| **Approvals / Gates** | `StatusFlyoutPanel` (pending approvals section), inline in `/chat` task gutter | No dedicated list/detail route — approve/reject inline where surfaced | — | Gate **rules** (policy) live in Settings/Agent detail; gate **instances** (a pending approval) have no standalone page |
| **Integrations** | Nested under `/projects/[id]?tab=integrations` (`ProjectIntegrationsPanel`) — **no standalone `/integrations` route** | `/projects/[id]/integrations/[integrationId]` | dialog on the project's integrations tab | Matches CLAUDE.md's documented "integrations under projects" convention |
| **Archive** | `/archiv` | inline via `?run=` | — | The task/run history surface |

---

## 6. i18n

- `apps/web/i18n/messages/cs.json` and `en.json`, **2230 lines each** (flat keys,
  `t('Key', {sub:1})` per CLAUDE.md convention; default locale `cs`).
- `apps/web/i18n/request.ts` reads the `locale` cookie server-side; no path
  prefix. Locale toggled client-side in `/settings` (preferences tab) and via
  `LangSwitch` in `ChatTopBar` — both just write the cookie + `router.refresh()`.
- Message keys are namespaced per screen/feature (`chat.*`, `chat.search.*`,
  `agents.*`, `settings.*`, `settings.subnav.*`, `nav.*` for `NAV_ITEMS` labels,
  etc.) — DS itself stays i18n-agnostic (English default props, app overrides via
  `t()`).

---

## 7. Test coverage

### Web unit/component tests
**201** `*.test.tsx`/`*.test.ts` files under `apps/web` (jsdom, per-domain,
colocated next to the component/hook they test — e.g. every chat sub-component
above has a matching `.test.tsx`).

### E2E (Playwright, root-level `e2e/`, **6 spec files**)
| Spec | Route(s) exercised | Scenario |
|---|---|---|
| `e2e/approval.spec.ts` | `/chat` | Confirm a pending approval from the chat task gutter |
| `e2e/briefing.spec.ts` | `/chat` | Generating a briefing appends it to the chat transcript |
| `e2e/channels.spec.ts` | `/projects/demo-project?tab=integrations` | A triaged inbound message surfaces an approval; approving it |
| `e2e/memory-graph.spec.ts` | `/memory` | Graph renders, node→note, search, tier filters, create-note dialog |
| `e2e/pipeline-edit.spec.ts` | `/pipelines` | Open a pipeline, enter its inline canvas editor |
| `e2e/pipeline-run.spec.ts` | `/pipelines` | Open a pipeline, see phase chain, run via task composer |

**Routes with ZERO e2e coverage**: `/agents(+[id])`, `/automations(+[id])`,
`/commands(+[id])`, `/companies(+new,[id])`, `/hooks(+[id])`, `/mcp(+[id])`,
`/settings` (all 11 tabs), `/signals(+new,[id])`, `/teams(+new,[id])`, `/archiv`,
`/projects` (list + new), and the project detail's `overview`/`profile`/`secrets`/
`roadmap` tabs (only `integrations` tab is touched, indirectly, by
`channels.spec.ts`). **A restructure around companies/teams/departments touches
almost none of the routes Playwright actually watches** — e2e gives no safety net
for that surface; regression risk there is caught only by the 201 unit tests
(which are colocated per-component, so they'll mostly need updating in place
rather than catching cross-route wiring breaks) and manual/live-browser
verification (a pattern the project's own memory notes repeatedly call out as
necessary — jsdom misses CSS/`"use client"`/pointer-events bugs).

---

## 8. Half-built, dead, redirect shims, and grammar inconsistencies

1. **Root `CLAUDE.md`'s "Routing" section is stale.** It describes `AppShell` as
   rendering `MainLayout` with nav/rail/voice/task slots and lists `/overview` and
   `/gates` as real segments. Both are gone (deleted in the HUD→Chat migration,
   `project_hud_to_chat_migration_arc.md`); `AppShell.tsx`'s own comments say so
   explicitly. Any redesign plan should not trust that section of the project doc
   as ground truth — this report reflects the actual code.
2. **`/runs` is a permanent-feeling temporary redirect shim** to `/archiv`,
   kept alive only because historical chat-transcript JSONL on disk embeds
   `/runs?run=` links and there's no retention policy to safely delete it (see
   `app/(dashboard)/runs/page.tsx`'s docblock, and memory `feedback` notes flag
   this pattern generally as "rtk prints... verify $?" style landmines — separate
   issue, but same file family).
3. **`ChatSearch`'s index and `ChatToolDock`'s nav are two different, overlapping
   but non-identical surfaces.** Search indexes: agent, pipeline, subsystem, task,
   memory, skill, mcp, project, command, company, setting, action (12 kinds) —
   **omitting teams, automations, hooks, and signals** even though those have
   their own `NAV_ITEMS`/dock entries. A user typing "team" or "hook" into ⌘K gets
   nothing; they must know to use the dock icon instead. This is an inconsistent
   discovery surface a redesign should either unify or deliberately re-scope.
4. **The former 5th top-bar element ("switch to HUD") was removed outright**
   (`ChatTopBar.tsx` comment: F9/O7) once its destination (`/overview`) was
   deleted and every route became immersive — a controls-that-point-nowhere smell
   that was caught and fixed, but is evidence the chrome has been repeatedly
   pruned reactively rather than redesigned holistically — exactly the situation
   the company-metaphor redesign is meant to resolve.
5. **`features/goals`** has queries/mutations (`useGoalsQuery`,
   `useCreateGoalMutation`, `useResumeGoalRunMutation`) but **no dedicated
   `Screen.tsx` or route** — it's consumed by other surfaces (roadmap auto-pickup,
   goal-loop engine) without its own UI home. Worth deciding whether "goals"
   becomes a first-class entity in the company metaphor or stays backend-only.
6. **Approvals/gate instances have no standalone list route** — they only surface
   inline (chat task gutter, `StatusFlyoutPanel`). If the redesign wants a
   "department inbox" of pending decisions, this is currently scattered rather
   than centralized.
7. **One interaction grammar** (edit top-right, card-click → detail, dialogs only
   for create/confirm) is **largely honored** across the domain screens audited:
   every `DetailScreen` puts Save/Delete top-right via `ImmersivePage`'s `actions`
   prop, list screens open dialogs only to create, and card clicks route to
   `/domain/:id`. The one architecturally distinct outlier is **`/pipelines`**,
   which uses a master-detail pattern (`selectedId` prop on one `Screen`) instead
   of a separate `DetailScreen` — functionally consistent (card click still
   "opens detail") but structurally different from every other domain, worth
   flagging for consistency in a rebuild.
8. **Companies vs. Teams asymmetry is intentional but easy to miss**: Teams
   mirror Companies' basics+linked-projects pattern but deliberately drop the
   people roster and budget ("those stay company-only" — `teams/DetailScreen.tsx`
   docblock). Since the redesign explicitly wants departments/employees, this
   existing Company→Team→Project hierarchy (with Subsystems as a *cross-cutting*
   mythic-department layer via `ownerSubsystem`) is the closest existing scaffold
   to build on — but today there are **two unrelated "department-ish" concepts**
   (Subsystems = system-internal capability areas; Companies/Teams = client-side
   org structure) that a company-metaphor redesign will need to consciously
   reconcile or keep separate.
9. **`apps/web/features/graphify-out`** exists as a features subfolder name but
   is not app code — it's the project's own knowledge-graph build output living
   oddly inside `features/`; worth a sanity check that it isn't accidentally
   bundled.

---

## Key file references
- Shell: `apps/web/app/layout.tsx`, `apps/web/app/providers.tsx`,
  `apps/web/app/(dashboard)/layout.tsx`,
  `apps/web/components/layout/AppShell/AppShell.tsx`,
  `apps/web/components/layout/ImmersivePage/ImmersivePage.tsx`,
  `apps/web/components/layout/BootSplash/BootSplash.tsx`
- Chat home: `apps/web/features/chat/components/ChatScreen.tsx`,
  `ChatTopBar.tsx`, `ChatSearch.tsx`, `ChatToolDock.tsx`, `SubsystemOrbMap.tsx`,
  `StatusPill.tsx`, `StatusFlyoutPanel.tsx`
- Nav config: `apps/web/state/config.ts`
- Org-structure scaffold: `apps/web/features/companies/DetailScreen.tsx`,
  `apps/web/features/teams/DetailScreen.tsx`,
  `apps/web/features/projects/ProfileScreen.tsx`,
  `libs/contracts/src/subsystems/subsystem.schema.ts`
- Settings hub: `apps/web/features/settings/Screen.tsx` +
  `apps/web/features/settings/components/*.tsx`
- Tests: `e2e/*.spec.ts` (repo root), 201 colocated `*.test.tsx`/`.test.ts` under
  `apps/web`
