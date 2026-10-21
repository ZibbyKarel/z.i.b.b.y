# Bridge dashboard — design + implementation plan

Date: 2026-10-21 · Source of truth for visuals:
`design/ZibbyCorp/design_handoff_bridge_dashboard/reference/Bridge Dashboard v2.dc.html`
(spec: `design/ZibbyCorp/design_handoff_bridge_dashboard/README.md`). When README and the
`.dc.html` disagree, the `.dc.html` wins. Never copy `support.js` or any `.dc.html` into product code.

## Goal

`/dashboard` becomes the new **Bridge**: a 12-column board of configurable widgets the operator
can rearrange, resize, add/remove, save as named presets and recall. A density switch
(COMPACT / COMFORT / AIRY / OPEN) changes **system-wide** DS spacing tokens, not just the board.
The current org-map dashboard (minions floorplan) moves to `/dashboard-old` unchanged.

## Decisions (operator, 2026-10-21)

| Topic | Decision |
|---|---|
| Incidents / Errors / Alerts widgets | **Not implemented** (no data source yet). Not in catalog. |
| INCIDENT preset | **Dropped.** Presets: DEFAULT, REVIEW, saved, CUSTOM. |
| Persistence | Server: `data/system-config.json` via `/api/system/config` (`ui` field). |
| Density mapping | Current DS spacing = **Comfort**. Default density = **Airy**. |
| Issues widget source | Same data as `/dashboard/inbox/issues`. |
| PR detail | New sheet per reference; predicates + mutations shared with `PrActions.tsx`. |
| PR action buttons | Only in the PR sheet, not on the PR card. |
| Merge | As today: in-app MERGE enabled only when `isMerge(pr)`; else disabled (35% / not-allowed) + `MERGE ON GITHUB ↗`. No `mergeInApp` setting. |
| Left dock | Stays. On `/dashboard` the `ActivityDock` starts **collapsed**. |
| Shell | App header / SectionNav / COO dock stay. Bridge's own header (layout segmented control, density, edit, clock) is a bar at the top of the page, not a replacement for the app header. `min-width:1440px` applies to the board, not the whole app. |

## Architecture

### 1. Contracts + API (`libs/contracts/src/system`, `apps/api/src/system`)

Extend `SystemConfigSchema` (it is `.strict()`, every field defaulted):

```ts
ui: z.object({
  density: z.enum(["compact","comfort","airy","open"]).default("airy"),
  bridge: z.object({
    layout: z.array(BridgeWidgetSchema).nullable().default(null),   // null = DEFAULT preset
    preset: z.string().min(1).default("DEFAULT"),
    saved: z.record(z.string(), z.array(BridgeWidgetSchema)).default({}),
    collapsed: z.record(z.string(), z.boolean()).default({}),
    epicClosed: z.record(z.string(), z.boolean()).default({}),
  }).default({}),
}).default({})
BridgeWidgetSchema = z.object({ id: z.string(), type: z.enum(["briefing","issues","prs","tasks","runs"]),
  x: int 0..11, y: int >=0, w: int 2..12, h: int >=1 })
```

PUT is whole-document, so the web side always merges into the latest cached config before sending.
Store test: `{}` still parses; a stored `ui` round-trips; an unknown widget type fails.

### 2. Global density in the DS (`libs/design-system`) — critical

- `spacingValues` in `tokens.ts` stop being literal px: each becomes `var(--sp-<token>)`
  (e.g. `"200": "var(--sp-200)"`). `globals.css` defines `--sp-<token>: calc(<px> * var(--density))`
  on `:root` with `--density: 1`. Literal px stay available as `spacingPx` (number map) for JS math
  that needs numbers (SVG, canvas, LAYOUT constants are NOT scaled).
- Tailwind v4 base: `--spacing: calc(0.25rem * var(--density))` and the 5/6/7 overrides become
  `calc(18px * var(--density))` etc. **Ceiling:** this also scales `w-*/h-*/size-*` utilities; review
  visually and pin icon sizes if they look wrong.
- `[data-density="compact"] { --density: .75 }`, `comfort { 1 }`, `airy { 1.25 }`, `open { 1.25 }`.
- Same blocks carry the Bridge density table as CSS vars (literal values from README table):
  `--bridge-gap, --bridge-rh, --bridge-bp, --bridge-row-py/px, --bridge-pr-py/px, --bridge-row-border,
  --bridge-bar, --bridge-inner-gap, --bridge-head-h, --bridge-head-px, --bridge-epic-py/px,
  --bridge-brief-py/px, --bridge-kpi-fs, --bridge-kpi-px, --bridge-shadow, --bridge-border`.
  The board's JS grid math reads `gap`/`rh` from a TS table (`BRIDGE_DENSITY`) exported from the DS
  so CSS and JS cannot drift (a test asserts the TS table equals the CSS values).
- `DesignSystemProvider` gets `density?: Density` (default `"comfort"`), sets `data-density` on
  `<html>` and its root exactly like `data-theme`. `DensityScript` (sibling of `ThemeScript`) sets
  `<html data-density>` from localStorage key `zibby-density` pre-hydration (cache only — server
  config is the source of truth; the provider writes the cache).
- Update DS tests that assert literal px for spacing to assert the var.

### 3. Web shell (`apps/web`)

- `app/(company)/dashboard-old/page.tsx` renders `OrgMapScreen` (moved verbatim).
  `app/(company)/dashboard/page.tsx` renders `BridgeScreen`.
- `state/config.ts`: dashboard tabs: `map` → `/dashboard` (label "Bridge"/"Můstek"), add `old`
  → `/dashboard-old`. i18n `nav.subtab.dashboard.*` in en + cs (parity test).
- `AppShell`: `fullBleed` for `/dashboard` and `/dashboard-old`; ActivityDock collapsed by default
  on `/dashboard` (no panel open) without clobbering the user's stored dock state elsewhere.
- `providers.tsx`: density from `useSystemConfigQuery` → `DesignSystemProvider density`.
- `features/system/state/useUiSettings.ts`: `{ ui, setDensity, setBridge(patch) }` — merges into
  the latest config, debounced 400ms for bridge layout writes; optimistic cache update.

### 4. Shared PR action logic

Move `isReview / hasThreadsToAddress / isFix / isRebase / isMerge / handled / hasPrActions` (and
`SETTLE_MS`) from `features/inbox/components/PrActions.tsx` to `features/inbox/state/prActions.ts`
(pure, unit-tested). `PrActions.tsx` imports them; behavior unchanged. Extract the button cluster so
it can render in the Bridge PR sheet footer (`PrActionButtons` with the same mutations, review level
picker included).

### 5. Bridge feature (`apps/web/features/bridge/`)

```
grid/          pure: layout.ts (compact, fromArr, place, dragMove, dragResize), presets.ts
               (DEFAULT, REVIEW), positions.ts (cw, left/top/width/height). Unit tests.
state/         useBridgeState (layout/preset/saved/collapsed/epicClosed ↔ useUiSettings; editing,
               catalog, sel, anchor local), prStatus.ts (TS() port → our InboxPr), rows.ts adapters
components/    BridgeScreen, BridgeHeader, BridgeBoard, WidgetFrame, widgets/{Briefing,Issues,
               PullRequests,Tasks,RunningNow}Widget, DetailSheet + sheets/{Issue,Task,Pr}Sheet,
               NeedsYouCard
```

- Grid: ported literally from the reference (`compact(L, pri)`, drag/resize snapping, min 2×2,
  clamp to 12 cols, dragged widget priority, CUSTOM on manual change). View mode: empty or collapsed
  widgets render `h=1` and the board compacts; edit mode keeps real sizes.
- DEFAULT: `briefing 0,0,12,3 · issues 0,3,4,18 · prs 4,3,4,18 · tasks 8,3,4,10 · runs 8,13,4,8`.
  REVIEW: `prs 0,0,6,21 · issues 6,0,3,21 · tasks 9,0,3,11 · runs 9,11,3,10`.
- SAVE AS → `MY LAYOUT NN`; RESET → DEFAULT. Catalog lists types not on the board.
- Widget data (real, via existing queries; no mocks):
  - Briefing: `useBriefingQuery` lead + KPIs NEEDS YOU (approvals), RUNNING NOW (live runs),
    OPEN PRS (inbox prs), SPEND TODAY (limits/budget). ERRORS/INCIDENTS KPIs dropped.
  - Issues: the same query + grouping the `/dashboard/inbox/issues` screen uses; epic grouping by
    the parent/epic the items carry, else by project.
  - Pull requests: `useInboxPrsQuery`; stack grouping by `baseRef` → another PR's `headRef`;
    status via `prStatus()` (port of `TS()` precedence) mapped onto our fields.
  - Tasks: the list `/work/tasks` uses; pipeline chips from the task's workflow stages when present.
  - Running now: `useLiveRuns`.
- Detail sheet: `measure()` port (≥460px free right → open right else left; full board height;
  3px eraser strip; re-measure on update/resize via ResizeObserver). Overlay `--bg` 74%.
  J/↓ K/↑ within the widget, Esc closes sheet → catalog → edit mode. Inputs/textarea ignore keys.
  - Issue sheet: description, details table, footer `OPEN IN <SRC> ↗` + the existing
    "process into task" action the issues screen already offers.
  - Task sheet: chain cards, subtasks, agents, artifacts where the data has them; NeedsYouCard
    with APPROVE / DENY from the task's pending approval (existing approval mutations).
  - PR sheet: REVIEW / CHECKS / CHANGES stat cells, stack breadcrumb, description, checks, files +
    diff (`useInboxPrDiffQuery`), footer `OPEN ON GITHUB ↗` + `PrActionButtons` + MERGE per decision.
- Styling: literal values from the reference via DS primitives' passthroughs / CSS module in the
  feature (no inline `style` on raw DOM — ESLint `react/forbid-dom-props`; dynamic geometry goes
  through a DS component `style` passthrough or an eslint-disable on raw nodes as CLAUDE.md allows).
  Radius 0, no shadows except density Open, glyphs as text, `prefers-reduced-motion` disables motion.
- i18n: all visible strings via `t()` (en + cs).

## Out of scope

Incidents/Errors/Alerts widgets, INCIDENT preset, Sentry, removing the left dock, `mergeInApp`
setting, card-level PR action buttons on the Bridge.

## Implementation plan (sequential tasks; one committer at a time on `main`)

Each task: TDD where logic exists, `prettier --write` + `eslint --fix` on touched files, scoped
vitest (`--project web-components` for apps/web components), commit with
`PATH="$PWD/node_modules/.bin:$PATH" rtk git commit -- <paths>`; regenerate + include
`.zibby/data/vault/knowledge/self-knowledge.md` if the gate asks. No `graphify update .` until
the end. Never `--no-verify`. Do not touch the untracked `design/ZibbyCorp/*` files.

1. **Contracts + API `ui` config** (§1).
2. **DS density** (§2) — reviewed by Opus with extra care.
3. **Web shell**: routes move, nav, AppShell fullBleed + dock, providers density, `useUiSettings` (§3).
4. **Shared PR action logic** extraction (§4).
5. **Bridge grid engine** pure modules + tests (§5 grid).
6. **Bridge screen**: header, board, widget frame, edit mode, drag/resize, catalog, presets,
   persistence.
7. **Widgets + adapters**: Briefing, Issues, PRs (+ `prStatus`), Tasks, Running now.
8. **Detail sheet** + Issue/Task/PR sheets + keyboard + PR action buttons.
9. **Visual parity pass**: Playwright screenshots reference vs app at 1440×900 and 1920×1080
   (default board, each density, edit mode, catalog, each sheet, selected row, collapsed/empty
   widget, each preset); fix until only explained deviations remain. Then `graphify update .`,
   repo-wide `check:types` / `check:lint` / web tests.
