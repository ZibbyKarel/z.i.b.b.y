# Immersive Chrome (Velín-D phase 2) — Design Spec

**Feature:** Align the global color system with the Velín-D prototype and redesign
three pieces of `/chat` chrome — the top panel, a new right-side tool dock, and the
left task list — plus the two controls the redesign displaces (New chat, Voice toggle).

**Branch:** `feat/immersive-chrome`
**Scout reports:** `.superpowers/sdd2/design-analysis.md` · `.superpowers/sdd2/current-state.md`
**Ledger:** `.superpowers/sdd2/progress.md` (operator decisions are binding)

---

## 1. What & why

Phase 1 rebuilt `/chat` as a greenfield immersive orb map. Phase 2 dresses the chrome
around that map in the Velín-D "liquid glass" visual language: transparent glass pills
floating over the scene gradient instead of solid bordered bars, a right-edge tool dock
that indexes the HUD, and a floating-card task list on the left. The color system is
brought fully in line with the prototype's `ZT` palette — authorized as a **global**
change (the whole HUD recolors, not just `/chat`).

The prototype's core palette (`ZT`) and the app's live DS tokens are **already almost
identical** (phase-1 groundwork). So the token work is a *lock + fill*, not a refactor:
reconcile one drifted value, add the three glass-recipe tokens the chrome needs, and
recolor the eight subsystem identity hues to the prototype values. The visible novelty
is the glass chrome and the three redesigned regions.

### Why these four things, in this order
1. **Tokens first** — every downstream surface inherits color/glass values.
2. **Glass primitive** — top bar, tool dock, and task cards all sit on one glass recipe;
   build it once as a DS component so no app code hand-rolls `backdrop-filter`.
3. **The three chrome regions** — top / right / left, each independently reviewable.
4. **Displaced controls + integration + i18n + verification** — wire it together, host
   the two relocated controls, complete the Czech/English catalogs, verify live on :3000.

---

## 2. Scope & non-goals

### In scope (exactly four things)
1. **Global color-token alignment** with the `ZT` palette + glass recipe + subsystem hues.
2. **Top panel redesign** — glass pills: mode indicator, counts-only status pill, ⌘K
   search trigger (restyled pill only — palette unchanged), the dual-ring limits gauge,
   a language switch, and the clock. **Close button removed.** New-chat and Voice-toggle
   **move out** of the top bar.
3. **New right-side tool dock** — a vertical glass icon rail that, this phase, *only links*
   to existing HUD pages: Companies → `/companies`, Projects, Agents, Skills, Commands,
   MCP, Memory, and (after a divider) Settings. No flyout entity lists; no run-task / add-note toolbar.
4. **Left task list redesign** — the floating-card look (`VcTaskCard` anatomy: hue rail,
   meta row, title, agent·phase row, progress meter) with a "Running tasks" header + count.

### Non-goals (explicitly next phase — do NOT build)
- **Bottom chat dock redesign.** The composer is touched *only* to host the two relocated
  controls (New-chat trash icon + Voice toggle); its layout/behavior otherwise unchanged.
- **Status-pill flyout.** The pill is **counts-only** this phase (`working · reports ·
  waiting`). No hover disclosure, no work/approval rows, no approve/reject.
- **Search modal redesign.** Keep the existing ⌘K `ChatPalette` quick-switcher as-is;
  only restyle its trigger into a glass pill.
- **Tool-dock flyout panels.** Icons navigate (a plain link); no 280px hover panel with
  entity lists, no empty-state, no "run task"/"add note" note-toolbar.
- **Subsystem / task detail overlays** (`SubsystemDrawer`, `ChatTaskDetailColumn` internals).
- **Narrow-viewport measured insets** (carried from phase 1).
- **Velín-C cross-link** and any prototype-only affordance.

---

## 3. Design → data-reality mapping (honest adaptations)

The prototype runs on mock data; the app runs on live contracts. Two prototype details do
not map 1:1 and are adapted deliberately — implementers must not "restore fidelity" by
inventing data:

| Prototype detail | App reality | Decision this phase |
|---|---|---|
| `VcTaskCard` left rail = **subsystem** identity hue (`task.sys`) | A `RunView` carries **no subsystem id** (`task.schema.ts`: a subsystem target "never reaches a stored run") | Rail hue = the run's **StateTone**: `const tone = runStateTone(run.status) ?? "accent"` (note `runStateTone` returns `StateTone \| undefined` — default explicitly), rendered via the DS `Card` built-in `edge={tone}` prop ("a solid 3px accent bar on the left edge, tinted by state", `Card.tsx`) — no bespoke hex plumbing. run→blue, report→green, waiting→amber, error→red. Subsystem-true coloring is deferred to when runs carry subsystem attribution. |
| Meta row shows **subsystem name** | Runs resolve a routed **owner** (agent/pipeline) glyph+avatar, not a subsystem | Meta row shows the routed owner's display name coloured by the same tone (`Typography tone={tone}`); the small dot is `StatusDot tone={tone}`. |
| `task.status = "Nominal"` (English literal in Czech UI) | `StatusPill` already renders `t("statusPill.nominal")` | Keep the existing i18n key; Czech copy is the operator's call (default: `"Nominální"`). No English literal in source. |

The status pill's `working / report / waiting` counts already come from
`useSubsystemsQuery` (subsystem `state ∈ {running, report, waiting, idle}`) — that stays.

---

## 4. Token changes (exact values)

The canonical palette is `ZT` from `design-analysis.md §1`. Live DS tokens already match it
except where noted. Value changes must land in **every mirror** (`current-state.md §1`):
`globals.css` (the `@theme` block), `darkTheme.ts` (runtime inject), `stateTone.ts`
(non-CSS hex fallback), `immersive/orbState.ts` (`ORB_STATE_COLOR`). `lightTheme.ts` is
inert (app is dark-only) and is left untouched.

### 4a. Verified already-correct (assert, do not change)
- `--color-background #0b0e13`, `--color-surface #10151c`, `--color-elevated/-raised/-hover
  #151c25`, `--color-border rgba(255,255,255,.08)`, `--color-border-strong rgba(255,255,255,.14)`.
- `--color-foreground #e6edf3`, `--color-foreground-dim #9aa7b4`.
- `--color-accent #5b8def`, `--color-accent-dim rgba(91,141,239,.14)`.
- States: `--color-ok #3fcf8e`, `--color-warn #f0b429`, `--color-bad #ff6b6b`, `--color-run #7aa5f8`.
- Risk: `--color-risk-payment #f0b429`, `--color-risk-deletion #ff6b6b`,
  `--color-risk-push #b07cff`, `--color-risk-send #56c4d6`.
- Radii `6px` (controls) / `10px` (panels). `stateTone.ts` `stateToneHex` already equals ZT.
- `orbState.ts` `ORB_STATE_COLOR` already equals ZT (working #7aa5f8, report #3fcf8e,
  await #f0b429, incident #ff6b6b, thinking #5b8def, idle=foreground-faint).

### 4b. The one drift to reconcile
- `darkTheme.ts` `colorForegroundFaint: "#7a8793"` → **`"#66737f"`** (== `globals.css`
  `--color-foreground-faint` == `ZT.ink3`). Single-line fix.

### 4c. New glass tokens (the `VD_GLASS` recipe, verbatim from `design-analysis.md §1`)
```
--gradient-glass: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5));
--color-glass-border: rgba(255,255,255,0.12);
--shadow-glass: inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42);
--blur-glass: blur(22px) saturate(180%);   /* consumed via the DS GlassSurface style, not a Tailwind util */
```
These land in **four** places so the token story typechecks and injects end-to-end
(the `Theme` interface in `tokens.ts` is explicit and all-required, and both theme
files are typed `: Theme`):
1. `libs/design-system/src/tokens.ts` — add `gradientGlass`, `colorGlassBorder`,
   `shadowGlass`, `blurGlass` (all `string`, **required**) to the `Theme` interface
   **and** to `tokensToCssVars()` (`"--gradient-glass": t.gradientGlass`, …) so
   `DesignSystemProvider` injects them at runtime (no reliance on Tailwind v4
   emitting non-standard `@theme` namespaces).
2. `libs/design-system/src/theme/globals.css` — the `@theme` block (SSR default).
3. `libs/design-system/src/themes/darkTheme.ts` — the values above.
4. `libs/design-system/src/themes/lightTheme.ts` — the **same values** (the app is
   dark-only and lightTheme is inert, but the shared `Theme` type requires the keys;
   a light-tuned glass recipe is out of scope).

### 4d. Subsystem identity hues → prototype values
`libs/contracts/src/subsystems/subsystem.schema.ts` `SUBSYSTEMS` registry `color` fields.
Current values are provisional; recolor to `design-analysis.md §1` (the eight names match 1:1):

| id | current `color` | → new (ZT) |
|---|---|---|
| forge | `#f97316` | `#5b8def` |
| herald | `#1998f0` | `#56c4d6` |
| sentinel | `#ef3977` | `#34c9bd` |
| scout | `#2cc91d` | `#46cf8b` |
| maestro | `#e552f4` | `#e0a83c` |
| beacon | `#f2f20d` | `#f4785c` |
| puls | `#15c187` | `#f2749e` |
| loom | `#775ff1` | `#b07cff` |

The schema regex `^#[0-9a-f]{6}$/i` accepts all eight. Any snapshot/fixture asserting the
old hex updates in the same task.

---

## 5. Component inventory (exact visual values)

All new user-visible chrome is composed from the DS. Glass surfaces are the new
`GlassSurface` DS primitive; no app DOM node hand-rolls `backdrop-filter`/gradient
(`react/forbid-dom-props` forbids inline style in `apps/web`).

### 5.1 `GlassSurface` — DS primitive (new)
- **Location:** `libs/design-system/src/immersive/GlassSurface/GlassSurface.tsx`
  (immersive bundle; follows the bundle's `"use client"` + TestId-enum conventions.
  It deliberately does **not** call `ensureImmersiveCss()` — that injector exists for
  the `im*` keyframes, and GlassSurface uses no animation).
- **Renders:** a single `div` with the glass recipe applied via inline `style` (DS
  immersive components already use inline style — the `forbid-dom-props` rule targets
  `apps/web`, not the DS). Background `var(--gradient-glass)`, `backdropFilter`
  `var(--blur-glass)`, `border 1px solid var(--color-glass-border)`, `boxShadow
  var(--shadow-glass)`.
- **Props:** `radius?: "control" | "panel" | "pill"` (→ 6px / 10px / 9999px, default
  `panel`), `padding?` (DS spacing token passthrough), `style?` (merge passthrough for
  dynamic values), `children`, `data-testid`. No `className` prop (DS convention).
- **TestId enum:** `GlassSurfaceTestId { Root = "glass-surface" }`.
- **Story:** `GlassSurface.stories.tsx` over the scene gradient background, all three radii.

### 5.2 Top panel — `ChatTopBar` (new, extracted from `ChatScreen` inline JSX)
- **Location:** `apps/web/features/chat/components/ChatTopBar.tsx` (`"use client"`).
- **Container:** absolutely positioned top strip, height ~56px, `padding 0 22px`,
  `display:flex, gap:10`, `pointer-events-auto` island over the map; transparent
  background (items are individual glass pills). **No `border-b`** (the old bar's border
  is dropped — glass floats).
- **Left group:** `Icon name="butlerSign"` + `Typography` mode label (`t("modeLabel")`,
  e.g. "CHAT") + `StatusDot` (`data-testid` `chat-screen-mode-dot`, tone/pulse from
  `MODE_DOT[mode]` — unchanged behavior).
- **Center group (glass pills):**
  - **Status pill** — the existing `StatusPill` component, now wrapped in `GlassSurface
    radius="pill"`. Counts-only (`working · report · waiting`), unchanged data. `StatusDot
    tone="ok"` + nominal label + up-to-three colored count segments (run/warn/accent tones).
  - **Search trigger** — `GlassSurface radius="pill"` wrapping the existing `SearchBar`
    (opens `ChatPalette` ⌘K). `SearchBar`'s real API: `ariaLabel` (required),
    `placeholder`, `shortcut` (it renders its own `<kbd>` from this string), `onClick` —
    so: `ariaLabel`+`placeholder` = `t("palette.placeholder")`, `shortcut="⌘K"`. No
    separate `Kbd` composition. Behavior unchanged; chrome restyled to glass.
- **Right group (glass pills):**
  - **`LimitsRings`** — reuse the existing component verbatim
    (`apps/web/components/layout/LimitsRings/LimitsRings.tsx`): two 30×30 SVG donut gauges
    (rolling 5h · weekly) + hover/focus popover. Wrap in `GlassSurface radius="pill"`.
    Its trigger is a `Pressable` + `Container` (no own `Card`), so the glass wrap does
    not double-surface; the popover `Card` floats above it. Verify visually in the live
    pass — if it reads nested, drop the wrap (the popover keeps its `Card`).
  - **`LangSwitch`** (new small component,
    `apps/web/features/chat/components/LangSwitch.tsx`) — `GlassSurface radius="pill"`
    wrapping a `ButtonGroup` with `{ id:"cs", label:"Čeština" }`,
    `{ id:"en", label:"English" }`. Reuses the **settings** mechanism exactly:
    `document.cookie = "locale=<v>; path=/; max-age=31536000"` then `router.refresh()`.
    Current locale from `useLocale()`. Guard the change handler: `ButtonGroup.onChange`
    emits `""` when the active option is toggled off — only `"cs" | "en"` may be written.
    aria-label reuses the existing `topbar.langSwitcherLabel` key (no new key).
  - **Clock** — `Typography mono` `HH:MM`, `useNow(MINUTE_MS)` (unchanged).
- **Removed:** the Close button (`chat-screen-close`) — **including its whole prop chain**:
  `ChatScreenProps.onClose` + its destructure, the `ChatScreenTestId.Close` enum member,
  and `Screen.tsx`'s `onClose={close}` (and the `close` handler if it becomes unused).
  The `chat.close` i18n key **stays** — it has a second live consumer
  (`CoreOverviewDialog.tsx` `tChat("close")` aria-label); deleting it would regress that
  dialog. Also removed from this bar: the New-chat and Voice-toggle controls
  (relocated — §5.5).
- **TestId enum:** `ChatTopBarTestId { Root = "chat-top-bar", Mode = "chat-top-bar-mode",
  Search = "chat-top-bar-search", Lang = "chat-top-bar-lang", Clock = "chat-top-bar-clock" }`.
  (Mode dot keeps `chat-screen-mode-dot`; status-pill keeps its own `chat-status-pill*` ids.)

### 5.3 Right tool dock — `ChatToolDock` (new)
- **Location:** `apps/web/features/chat/components/ChatToolDock.tsx` (`"use client"`).
- **Geometry:** absolutely positioned `right: 24`, vertically centered
  (`top:50%, translateY(-50%)`), `zIndex ~14`, `pointer-events-auto`. A single
  `GlassSurface radius="panel"` column, `padding 7`, `gap 6`, `flex-direction:column`.
  Inside the glass, the links sit in a semantic `<nav aria-label={t("chat.toolDock.label")}>`
  landmark (a bare element, no styles — the aria-label is this key's consumer).
- **Items** (drawn from `state/config.ts` — do NOT hardcode a parallel list): filter
  `NAV_ITEMS` to the design set in this order, then a `Divider`, then `SETTINGS_ITEM`:

  | order | id | glyph (from config) | href |
  |---|---|---|---|
  | 1 | companies | branch | `/companies` |
  | 2 | projects | code | `/projects` |
  | 3 | agents | bot | `/agents` |
  | 4 | skills | spark | `/skills` |
  | 5 | commands | bolt | `/commands` |
  | 6 | mcp | server | `/mcp` |
  | 7 | memory | brain | `/memory` |
  | — | *divider* | | |
  | 8 | settings | gear | `/settings` |

  `/companies` route **verified to exist** (`apps/web/app/(dashboard)/companies/{page,[id],new}`
  + `NAV_ITEMS` entry `{ id:"companies", glyph:"branch", href:"/companies" }`).
- **Each button:** a 38×38 `next/link` (`href`) wrapping `Icon` (13px, `foreground-dim`
  default, `accent` on hover/focus), inside the DS `Tooltip` (`content={t(`nav.${id}`)}`;
  note `TooltipSide` is `"top" | "bottom"` only — use the default `top`, there is no
  left-side placement and extending it is out of scope). A tooltip provides a
  *description*, not a *name*, so **every `Link` also carries an explicit
  `aria-label={t(`nav.${id}`)}`**. Labels reuse the existing `nav.*` namespace verbatim —
  including `nav.settings`, which already exists ("System settings" / "Nastavení systému");
  do not re-add or reword it. Keyboard-focusable; navigates on click (leaves `/chat`).
- **TestId enum:** `ChatToolDockTestId { Root = "chat-tool-dock", Nav =
  "chat-tool-dock-nav", Settings = "chat-tool-dock-settings" }`; each nav link carries
  `data-testid={`chat-tool-dock-${id}`}`.
- **Orb-map inset:** `SubsystemOrbMap` `insets.right` moves off `0` to the dock's occupied
  width (dock width + right offset, ≈ `70`) so the map never renders under the dock.

### 5.4 Left task list — floating cards
- **Files:** rewrite `apps/web/features/chat/components/ChatTaskRow.tsx` (→ card anatomy)
  and adjust `ChatTasksPanel.tsx` (header). Data source unchanged: `useRunsQuery()`, sort
  `taskRank()`, `w-[300px]` gutter `inset-y-0 left-0`, `hidden` below `lg`.
- **Panel header:** replace the plain `HudPanel title="Tasks"` label with a live 7px pulsing
  `StatusDot tone="run"` + `Typography type="label"` `t("tasks.title")` ("Running tasks") +
  right-aligned count (`runs.length`, `mono`, `foreground-dim`).
- **Card anatomy** (`VcTaskCard` port, `Card` DS base; `const tone =
  runStateTone(run.status) ?? "accent"` — `runStateTone` returns `StateTone | undefined`,
  default explicitly):
  - (a) 3px-wide left rail via the built-in `<Card edge={tone}>` prop (Card ships exactly
    this: "a solid 3px accent bar on the left edge, tinted by state") — no raw hex, no
    style passthrough.
  - (b) meta row: `StatusDot tone={tone}` + owner display name (`Typography mono`
    `tone={tone}`, 600) + `RunStateBadge` (micro) + right-aligned relative start time.
  - (c) title (`runTitle(run)`, sans 13.5px 500, single-line ellipsis).
  - (d) agent·phase row: `Icon name="run"` (or `pulse` when live/continuous) + `"{owner} ·
    {phase}"` micro. For agent runs `phase` = current stage label; for goals/pipelines use
    the run's stage/`RunStateBadge` text.
  - (e) progress meter: `Progress tone={tone}` + `mono` `{pct}%` — **only when `run.pct != null`**
    (agent runs); pipelines/goals omit the meter, matching today's behavior and the
    prototype's continuous-task rule.
  - **Hover:** background → `elevated`, tone-tinted border, `translateX(4px)`, deeper
    shadow (via `Card living`/`tone`). The prototype's decorative `vcFloat` idle-breathing
    animation is **dropped** this phase (YAGNI — no keyframe step, no inline `@keyframes`
    path left open).
- **Selection:** keep today's behavior — selected = accent border/ring, click toggles,
  opens `ChatTaskDetailColumn` (unchanged; detail internals out of scope).
- **TestId enum:** keep `ChatTaskRowTestId.Row = "chat-task-row"` (test continuity); add
  `Meta = "chat-task-row-meta"`, `Progress = "chat-task-row-progress"`. (No `Rail` testid —
  the rail is `Card`'s own `edge` rendering, not a node this component owns.)
  `ChatTasksPanelTestId` unchanged (`Root/List/Empty`).

### 5.5 Displaced controls (relocated into the composer/bottom dock)
- **New chat (trash icon):** move to the composer area — a small circular icon button
  (`Icon name="trash"`, `title`/`aria` `t("newChat")`, `onClick={onNewChat}`), rendered only
  when `messages.length > 0`. Keeps `data-testid="chat-screen-new-chat"` for test continuity.
- **Voice toggle:** move the existing `VoiceToggleButton` (rendered only when
  `voice.supported`) into the composer area next to `VoiceStatusStrip`.
- Composer otherwise unchanged (`VoiceStatusStrip` + `CommandLine`, max-width 720, border-top).

---

## 6. Data sources (reuse — invent nothing)
- **Limits gauge:** `useLimitsQuery()` → `Limits { rolling, weekly, capturedAt, stale }`
  (each window `{ usedPct, resetsAt }`). Rendered by the existing `LimitsRings`. Do not add
  a query or a new gauge.
- **Status-pill counts:** `useSubsystemsQuery()` → `SubsystemWithStatus[]`, `state ∈
  {idle, running, report, waiting}`. `working = state==="running"`, `report =
  state==="report"`, `waiting = state==="waiting"` (already implemented in `StatusPill`).
- **Task list:** `useRunsQuery()` (unified runs feed, SSE-fresh), sort `taskRank()`.
- **Locale:** `useLocale()` (read) + cookie write + `router.refresh()` (write) — settings' mechanism.
- **Tool-dock targets/glyphs/labels:** `NAV_ITEMS` / `SETTINGS_ITEM` (`state/config.ts`) +
  `t("nav.<id>")`.
- **Task-card tone:** `runStateTone(run.status) ?? "accent"` (`StateTone | undefined` —
  always default) fed to `Card edge`, `StatusDot`, `Typography`, `Progress` `tone` props.
- **Subsystem hues:** `SUBSYSTEMS` registry `color` (after §4d recolor) — consumed wherever
  subsystem identity color is shown (orb map, drawer). The task card uses **StateTone**, not
  these (see §3).

---

## 7. i18n key list

DS components stay i18n-agnostic (English-default string props). Every user-visible app
string goes through next-intl in `apps/web/i18n/messages/{cs,en}.json`. Czech copy from
`design-analysis.md §6`; English is the sensible default.

**Already present (reuse verbatim, do not duplicate or reword):** `chat.modeLabel`,
`chat.newChat`, `chat.palette.placeholder`,
`chat.statusPill.{nominal,working,report,waiting}`,
`nav.{companies,projects,agents,skills,commands,mcp,memory}`,
`nav.settings` ("System settings" / "Nastavení systému" — exists, reuse as-is),
`topbar.langSwitcherLabel` ("Interface language" / "Jazyk rozhraní" — the LangSwitch
aria-label; do **not** mint a `chat.langSwitch.*` duplicate), `limits.*`, the existing
voice-toggle labels.

**Catalog changes this phase — ALL landing in one task (plan Task 7), never in the
component tasks (they would collide under parallel execution):**

| change | key | cs | en |
|---|---|---|---|
| copy update | `chat.tasks.title` | `Tasky` → `Běžící úlohy` | `Tasks` → `Running tasks` |
| confirm copy | `chat.statusPill.nominal` | `Nominální` | `Nominal` |
| add | `chat.toolDock.label` (the tool dock's `<nav>` aria-label) | `Nástroje` | `Tools` |

`chat.close` is **kept** despite the Close button's removal — `CoreOverviewDialog`
still consumes it (`tChat("close")` aria-label).

A cs/en key-parity assertion (test) guards against a one-sided add.

---

## 8. Acceptance criteria

**Tokens**
- [ ] `darkTheme.ts` `colorForegroundFaint === "#66737f"`.
- [ ] `gradientGlass`, `colorGlassBorder`, `shadowGlass`, `blurGlass` are required keys on
      the `Theme` interface, mapped in `tokensToCssVars()`, present in **both**
      `darkTheme.ts` and `lightTheme.ts`, and mirrored in `globals.css` `@theme` with the
      §4c values — `rtk pnpm check:types` passes with both theme files typed `: Theme`.
- [ ] The eight `SUBSYSTEMS[].color` equal the §4d ZT hues; schema + fixtures pass.

**Top panel**
- [ ] Renders as floating glass pills over the scene (no solid `border-b` bar).
- [ ] Status pill is counts-only; no flyout appears on hover.
- [ ] Search pill opens the existing ⌘K palette; ⌘K still works globally.
- [ ] Limits gauge shows two rings + popover (reused `LimitsRings`).
- [ ] Language switch changes locale (cookie + `router.refresh`) and the UI re-renders in
      the new language; re-clicking the active language is a no-op (no empty cookie write).
- [ ] No Close button; the `onClose` prop chain is fully removed (`ChatScreenProps`,
      destructure, `ChatScreenTestId.Close`, `Screen.tsx` wiring) — lint has no unused-var;
      New-chat and Voice-toggle are absent from the top bar.

**Right tool dock**
- [ ] Eight glass icon buttons in the §5.3 order; each is a keyboard-focusable link to the
      right HUD route; Companies → `/companies` navigates successfully.
- [ ] Each icon shows a localized tooltip; Settings sits below a divider.
- [ ] The orb map does not render underneath the dock (`insets.right` updated).

**Left task list**
- [ ] Header shows a pulsing dot + "Running tasks" + live count.
- [ ] Each card shows: tone rail (`Card edge`), meta row (owner + state badge + relative
      time), title, agent·phase row, and a progress meter only when `pct != null`.
- [ ] Hover lifts/tints the card; selecting a card still opens the detail column.

**Displaced controls**
- [ ] New-chat trash button appears in the composer only when `messages.length > 0` and
      resets the thread; keeps `data-testid="chat-screen-new-chat"`.
- [ ] Voice toggle appears in the composer when supported and toggles voice mode.

**Quality gates**
- [ ] `rtk pnpm check:lint` clean; `rtk pnpm check:types` **and** `pnpm exec tsc -p
      apps/web --noEmit` clean; `pnpm test` green.
- [ ] Every new component has a TestId enum; tests select via `getByTestId`.
- [ ] No `forwardRef`, no `any`, no inline `style` on an `apps/web` DOM node.
- [ ] Storybook builds; `GlassSurface` story renders.

**Live-browser verification (mandatory — jsdom cannot catch it; phase 1 proved it)**
- [ ] With the dev server on `:3000`, load `/chat` in a real browser and confirm:
      glass pills are actually translucent (backdrop blur visible over the moving scene);
      the `LimitsRings` glass pill does not read as a nested double surface; the tool dock
      is clickable (`pointer-events` correct) and each link navigates; the status pill has
      no hover flyout; the language switch flips copy; the task cards hover-lift; New-chat
      + Voice live in the composer. Capture a screenshot after first paint (avoid the
      `.playwright-mcp/` Fast-Refresh trap; screenshot once loaded).

**Handoff**
- [ ] PARK at the PR gate — commit on `feat/immersive-chrome`, **never push, never open a PR**
      without an explicit operator instruction.
