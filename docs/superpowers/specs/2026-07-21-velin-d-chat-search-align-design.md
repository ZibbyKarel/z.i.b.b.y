# Velín-D chat UI + top search alignment — design spec

**Date:** 2026-07-21 · **Branch:** `feat/velin-d-chat-search-align`

Aligns the immersive `/chat` shell to the Velín-D design references. Two independent
workstreams. Design sources are the JSX mockups in `design/Z.I.B.B.Y/zibby/`:
`velin-d-chat.jsx` (`VcChatDock`) and `velin-d-search.jsx` (`VdTopSearch`). These are
static demos — copy their _look and control set_, not their fake data or hooks.

Operator decisions (2026-07-21):

- Composer: **reconfigure the shared `CommandLine` via its slots** — do NOT edit
  CommandLine's internal control layout (the task launcher + automations share it).
- Search: **broaden to the full design index** (live data only).

---

## Workstream A — Chat dock restyle (chat-local)

Files: `apps/web/features/chat/components/ChatDock.tsx`,
`apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (one additive prop only),
`ChatDock.test.tsx`, `ChatBottomBar.test.tsx`, i18n `cs.json`/`en.json`.

Target: `VcChatDock` in `design/Z.I.B.B.Y/zibby/velin-d-chat.jsx` (esp. the input row
lines 256–304, the trash button 215–228, the close button 206–214).

### A1. `CommandLine` — one additive prop

- Add optional `attachIcon?: IconName` to `CommandLineProps`, **default `"plus"`**.
  Render it as the attach `Button`'s `icon` (currently hard-coded `"plus"` at the
  attach button, ~line 921). No other CommandLine change. Task launcher/automations
  are unaffected because the default preserves today's glyph.

### A2. `ChatDock` composer

- Add a module constant near the top of `ChatDock.tsx`:
  `/** Composer auto-grows up to this many lines, then scrolls. Change here to retune. */`
  `const CHAT_COMPOSER_MAX_ROWS = 4;`
  Pass it to `CommandLine` as `maxRows={CHAT_COMPOSER_MAX_ROWS}`. (Growth stays
  CommandLine's existing newline-based `computeRows` — do not add scrollHeight
  measurement; the codebase deliberately avoids it, jsdom can't report it.)
- **Mic** moves into `CommandLine`'s `leadingActions` slot so the bottom-left cluster
  reads `[attach][mic]`. Remove the separate mic/trash row above the CommandLine
  (the `Stack` gated on `voice.supported || messages.length > 0`). `VoiceToggleButton`
  stays gated on `voice.supported`; `VoiceStatusStrip` (interim text) renders when
  `voice.active` — place it so it doesn't disrupt the single input row (e.g. a thin
  strip just above the composer, only while active).
- **Send** via `renderTrailing={({ canSubmit, submit }) => …}` — an icon-only round
  send button (`icon="arrow"`, `intent="primary"`, `size="sm"`, no label,
  `disabled={!canSubmit}`, `onClick={submit}`). Keep `data-testid` = existing send id
  path so tests still resolve it, or expose a dock-level testid; assertions must keep
  working.
- **Attach** paperclip: pass `attachIcon="paperclip"` to CommandLine.
- Keep `showAttach chrome={false} disabled={thinking} label onSubmit placeholder`.

### A3. Trash / new-chat

- A floating round ghost button pinned to the dock's right edge just above the
  composer (design: `right:10, bottom:58`, `icon="trash"`), rendered **only when
  `messages.length > 0`**, calling `onNewChat`. `aria-label`/`title` = `t("newChat")`.
  Use DS `Container position="absolute"` + `Button intent="ghost"` (no raw inline
  style on a DOM node).

### A4. Close (×)

- Keep the existing top-right close (`onClose`, `icon="x"`), matching the design's
  round pill treatment. Preserve `ChatDockTestId.Close`.

### A5. Remove greeting

- Delete the `isEmpty` greeting block (`ChatDockTestId.Greeting`,
  `t("greetingTitle")`, `t("greetingHint")`). An empty chat renders the empty history
  container (still scrollable/masked) — no placeholder text. Remove
  `greetingTitle`/`greetingHint` from `cs.json` + `en.json`. `ChatDockTestId.Greeting`
  enum member: remove it and any test asserting the greeting.

### A6. Tests

- `ChatDock.test.tsx`: drop greeting assertions; assert mic is inside the composer
  row, send is icon-only and still submits, trash appears only with messages, attach
  present. Keep testid-first selection + role/aria assertions per DS conventions.
- `ChatBottomBar.test.tsx`: adjust if it referenced the removed greeting/mic row.

---

## Workstream B — Inline top search (replaces the centered palette)

Files: **new** `apps/web/features/chat/components/ChatSearch.tsx` (+ `.test.tsx`),
`ChatTopBar.tsx`, `ChatScreen.tsx`; **delete** `ChatPalette.tsx` + `ChatPalette.test.tsx`;
i18n `cs.json`/`en.json`; `features/chat/index.ts` if it re-exports palette.

Target: `VdTopSearch` in `design/Z.I.B.B.Y/zibby/velin-d-search.jsx` (lines 103–176):
a pill that expands on focus/click, a results panel dropping **directly below it**, a
page-dim backdrop. No centered modal.

### B1. `ChatSearch` component

- Lives in the top bar's centre. Collapsed pill ~190–230px; expands to ~520px on
  focus/click (width transition). Real focusable input (reuse DS `SearchInput` if it
  fits; otherwise a DS-composed input — no raw `<input>` styling outside DS
  conventions). `GlassSurface` pill, search glyph, clear-`x` when typed, `⌘K` hint
  when collapsed+empty.
- Results panel: absolutely positioned `top: calc(100% + …)` under the pill, own
  glass panel, scrollable, animated in. A fixed full-page dim backdrop behind it
  (click / Esc closes). Open state driven by focus + typing; Esc blurs+closes.
- Imperative `focus()` handle (via `ref`) so `ChatScreen`'s `⌘K` can open+focus it.
- Testid enum `ChatSearchTestId` { Root, Input, Panel, Backdrop, Item }.

### B2. Broadened index (live hooks only)

Build a unified result list from existing query hooks; each row: `{ kind, id, title,
subtitle?, glyph, color? }`. Kinds + source + pick action:

| kind      | hook                                                                     | pick →                                                             |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| agent     | `useAgentsQuery`                                                         | `onDetailSelect({kind:'agent', agent})` (in-chat dialog, as today) |
| pipeline  | `usePipelinesQuery`                                                      | `onDetailSelect({kind:'pipeline', pipeline})`                      |
| subsystem | `useSubsystemsQuery`                                                     | `onSelectSubsystem(id)` (in-chat drawer)                           |
| task      | `useRunsQuery` (`.runs`)                                                 | `onOpenRun(runId)` (in-chat run-detail column)                     |
| memory    | `useMemorySearchQuery(q)`                                                | `onNavigate('/memory')`                                            |
| skill     | `useSkillsQuery`                                                         | `onNavigate('/skills/[id]' as Route)`                              |
| mcp       | `useMcpServersQuery`                                                     | `onNavigate('/mcp/[id]')`                                          |
| project   | `useProjectsQuery`                                                       | `onNavigate('/projects/[id]')`                                     |
| command   | `useCommandsQuery`                                                       | `onNavigate('/commands/[id]')`                                     |
| company   | `useCompaniesQuery`                                                      | `onNavigate('/companies/[id]')`                                    |
| setting   | static shortcut set                                                      | `onNavigate('/settings')`                                          |
| action    | synthetic "generate briefing" (match on briefing/report/přehled/shrnutí) | `onGenerateBriefing()`                                             |

- Filter: case-insensitive substring over `title + subtitle` (mirror
  `ChatPalette.matchesQuery`). Memory uses its server search query keyed on `q`.
- Cap the rendered list (e.g. 30) as a runaway guard; group/label by kind using the
  design's kind labels (`VD_SEARCH_KIND_LABEL`, translate into i18n).
- Dynamic route hrefs need `as Route` (typed-routes convention — see memory note
  "query-string template needs `as Route`").
- Verify each detail route param name against `app/(dashboard)/<seg>/[id]/page.tsx`
  before wiring (all of agents/pipelines/skills/mcp/projects/commands/companies have
  `[id]`). If a segment's real param differs, use the real one.

### B3. Wire into `ChatTopBar`

- Replace the `SearchBar` + its `GlassSurface` wrapper with `<ChatSearch … />`,
  forwarding the imperative ref up (topbar takes a `searchRef` prop from `ChatScreen`).
- Drop `onOpenPalette` from `ChatTopBarProps`; keep status pill, limits, lang switch.

### B4. Wire into `ChatScreen`

- Remove `paletteOpen`/`openPalette` and the `ChatPalette` mount. Add a
  `searchRef` and point the existing `⌘K` handler at `searchRef.current?.focus()`
  (keep the Esc handling the search itself owns). The old palette Esc branch goes away.
- Pass search callbacks: `onDetailSelect` (existing `setDetailTarget`),
  `onSelectSubsystem` (existing `setSelectedSubsystemId`), `onOpenRun`
  (existing `setSelectedRunId`), `onNavigate` (`router.push`),
  `onGenerateBriefing` (existing `triggerBriefing`), `briefingPending`.
- `ChatDetailDialog` stays. `overlayOpen` no longer includes `paletteOpen`.

### B5. i18n + cleanup

- Add a `chat.search` namespace (placeholder, ariaLabel, empty, kind labels, the
  briefing action strings — reuse the existing `palette.actions.*` wording). Remove the
  `chat.palette` namespace once `ChatPalette` is gone (grep for stragglers).
- Delete `ChatPalette.tsx` + test; remove any re-export.

### B6. Tests

- New `ChatSearch.test.tsx`: collapsed→expanded on focus, panel-below renders results,
  a pick fires the right callback per kind (at least agent→onDetailSelect,
  a navigate kind→onNavigate, briefing→onGenerateBriefing), Esc closes. Testid-first.
- Remove `ChatPalette.test.tsx`.

---

## Validation (each workstream, per the project policy)

Prettier + eslint --fix on changed files; run the changed package's affected vitest
files scoped (`pnpm exec vitest run <path> --project web` / web-components). Fix
failures before moving on. `rtk` prints "No errors found" while sometimes exiting
non-zero — verify with `$?`.

## Out of scope

- Editing CommandLine's control _layout_. Automations/chains/hooks/gates in search.
- scrollHeight-based textarea auto-grow.
