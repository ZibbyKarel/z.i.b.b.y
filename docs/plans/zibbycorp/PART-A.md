# Part A — Design system and visual language

**Branch:** `feat/zc-a-design-system`, cut from the tip of Part 0.
**Decisions:** D-007, D-010. **Defaults used:** O-01 (the light theme is built, but the
default stays dark until ZB-01), O-04.

**Canon:** `design/ZibbyCorp/ZibbyCorp Design System.md`, cited as "DS.md §n".

| DS.md § | Topic |
|---|---|
| §2 | Tokens |
| §3 | Type |
| §4 | Spacing |
| §5 | Layout |
| §6 | Shape |
| §7 | Glyphs |
| §8 | Component anatomy |
| §9 | Motion |

Visual reference screens: `ZibbyCorp App.dc.html`, `Org Screens.dc.html`,
`ZibbyCorp Directions.dc.html` (glyph state grid).

**Status: "hned".** This part touches only the DS, the lint wall and the 20 files that
use `className`. The app's screens keep their structure until Part B, but they visibly
re-skin because tokens and primitives change underneath them. That is intended.

**Rules for every DS component in this part:**
- `.claude/skills/design-system/SKILL.md` and `/scaffold-component`.
- A TestId enum, tests via `getByTestId`, stories Overview + Playground.
- No `className` prop, sealed sizes, React 19 ref-as-prop.
- Exported from `libs/design-system/src/index.ts`.
- **English default strings via props.**

---

## ZA-01 — Tokens, fonts, theme provider

**Paths:**
- `libs/design-system/src/tokens.ts`
- `libs/design-system/src/themes/{lightTheme,darkTheme}.ts`
- `libs/design-system/src/theme/globals.css`
- `libs/design-system/src/DesignSystemContext/**`
- `libs/design-system/src/stateTone.ts`
- `apps/web/app/layout.tsx` (fonts only)

**Deliverables**

1. **One source of truth.** `tokens.ts` defines the semantic tokens exactly per DS.md §2.4
   for light and dark (the `--bg`…`--s-idle` table, and `--gw` 0/8px).
   - `globals.css` `@theme` maps them to Tailwind v4 theme vars (`--color-bg`,
     `--color-panel`, `--color-ink-2`, `--color-state-work`, …).
   - `[data-theme="light"|"dark"]` selectors swap the values.
   - Remove the duplicated hex literals between the TS themes and the CSS. The TS themes
     read from `tokens.ts`, so `useTokens()` (SVG/canvas) stays consistent.
2. **State vocabulary.** `StateTone` becomes the 6 design states:

   `working | thinking | blocked | error | done | idle`

   in canonical order, exported as `STATE_ORDER`.
   - The old 5 tones map in a single `LEGACY_TONE_MAP`, used by the existing components
     until Part B rewrites their callers:

     | Old | New |
     |---|---|
     | accent | thinking |
     | ok | done |
     | warn | blocked |
     | bad | error |
     | run | working |

   - `LIVING-STATE.md` is updated.
3. **Type.** Load Geist (400/500/600) and Geist Mono via `next/font/google` in
   `layout.tsx`, replacing JetBrains Mono.
   - DS `Typography` variants cover DS.md §3.1/§3.2:
     - `display`, `h1`, `h2`, `h3`, `title`, `bodyLg`, `body`, `bodySm`, `caption`, `metric`;
     - mono: `wordmark`, `label`, `labelSm`, `code`.
   - Mono variants are uppercase with tracking per spec, and `metric` uses tabular-nums.
4. **Spacing, radius, layout.**
   - The spacing scale is exactly DS.md §4 (2…56). The sealed `Spacing` type is updated.
   - The radius tokens collapse to `0`. `radiusFull` survives only for the round exceptions
     in DS.md §6 (status pod/packet).
   - Layout constants: `headerHeight 56`, `railWidth 280`, `docMaxWidth 1320`.
5. **Effects.**
   - Delete the shadow, blur, glass and gradient tokens.
   - The only background pattern is the 24px grid (`--grid`), exposed as a `Surface`
     `pattern="grid"` prop.
   - `--gw` is used only by the live-status glow in dark.
6. **Motion.** Add the keyframes `zb-live`, `zb-pulse`, `zb-ring`, `zb-flow`, `zb-caret`,
   `zb-twinkle`, `zb-dot` and the glyph families from DS.md §9, **verbatim** into
   `globals.css`, all wrapped in `@media (prefers-reduced-motion: no-preference)`.
7. **Theme provider.**
   - `DesignSystemProvider theme: "light" | "dark" | "system"`.
   - It sets `data-theme` on `<html>` and persists the choice via `localStorage`, wrapped in
     try/catch, SSR-safe, with no flash (an inline script in DS `ThemeScript`).
   - `apps/web/app/providers.tsx` keeps `theme="dark"` in this part (O-01).

**Verification:**
- DS tests, and `tsc -p libs/design-system`.
- A Storybook "Tokens" story renders both themes side by side.
- A screenshot compare against DS.md §2.4 swatches.

**Commit:** `feat(ds)!: ZibbyCorp tokens, type, motion, light+dark theme`

---

## ZA-02 — Primitive restyle (parallel with ZA-03)

**Paths:**
- `libs/design-system/src/components/{Button,ButtonGroup,Chip,Tag,Tabs,Toggle,Checkbox,Dropdown,DropDownButton,SearchInput,SearchBar,form/**,Card,Panel,Surface,Container,Divider,Dialog,FloatingPanel,MenuSurface,MenuButton,Tooltip,Kbd,Progress,Stat,List,Accordion,Alert,CodeBlock,Markdown,MarkdownEditor,EntityHero,IconTile,Icon,StatusDot,HoldButton,DropZone,FilePreview,Sparkline}/**`
- The existing Corners component (wherever `Corners` lives).

**Deliverables**

Each component's CVA variants are rewritten to DS.md §6/§8:
- radius 0;
- 1px `--line` hairlines;
- no shadow;
- mono-uppercase control labels.

Notable changes:

| Component | Change |
|---|---|
| **Button** | Intents per DS.md §8 Buttons: `primary` = ink fill; `secondary` = hairline; `ghost`; `danger` = err hairline. Sizes sm/md. |
| **Tabs** | New variant `mono`: the top-nav / sub-nav look, with an underline indicator. |
| **StatusDot** | **Square**, with 6 tones from `StateTone`. Living behaviour: working = breathe, blocked = blink, the rest static. Sizes 6–9 via the sealed type. |
| **Corners** | Square L-marks, insets 8/10, colour ink; `CornersTone` = `StateTone`. |
| **Card / Panel** | Hairline, `--panel` bg, an optional `corners` prop, an optional `label` slot using SectionLabel (ZA-04). |
| **Dialog** | Hairline frame, no blur backdrop (a flat `--bg` at 70% opacity). It is still only for create/confirm. |
| **EntityHero** | Restyled to the Inspector hero (DS.md §8 Inspector): glyph slot 128, state pill, mono id line. |
| **HoldButton** | Keep the behaviour (0.9s for high-risk) and the square progress fill. |
| **LivingGlow / OrbitLoader / ProgressRing** | **Deprecated.** Mark them `@deprecated` in JSDoc; deletion is in ZB-13. |

Every changed component keeps its public props. Any **breaking** prop change is listed in
the commit body and its app call sites are fixed in the same commit.

**Verification:**
- The DS test suite.
- Storybook build (`pnpm storybook` build mode).
- `tsc -p apps/web`: prop changes must not break the app.

**Commit:** one per component group:
- `feat(ds): restyle controls`
- `… containers`
- `… feedback`
- `… content`

---

## ZA-03 — AgentGlyph and state vocabulary (parallel with ZA-02)

**Paths:**
- `libs/design-system/src/components/AgentGlyph/**` (new)
- `libs/design-system/src/components/StatePill/**` (new)
- `libs/design-system/src/components/CellStrip/**` (new)
- `libs/design-system/src/utils/seededRandom.ts` (reuse)

**Deliverables**

1. **`AgentGlyph`** is a port of the generator in `design/ZibbyCorp/zibby.js` (read it
   first; the 12×12 mirrored procedural sprite, DS.md §7).
   - Props:
     - `seed: string`;
     - `state: StateTone`;
     - `size: GlyphSize` (18 | 22 | 30 | 48 | 128);
     - `glow?: boolean`, which auto-disables for idle and for size < 40, and is visible
       only in dark via `--gw`.
   - It renders an SVG with `shape-rendering="crispEdges"`. Each state has its own stepped
     animation (`steps(1,end)`) per DS.md §9: working bobs and types, blocked shakes, and
     so on.
   - It is **deterministic**: the same seed gives the same sprite. A snapshot test covers
     5 seeds × 6 states.
   - It respects reduced motion.
2. **`StatePill`**: a square dot + mono label; the label defaults to the state name in
   English, overridable.
3. **`CellStrip`**: `cells: StateTone[]`, a wrapping row of 9px dots, with an optional
   `max` and `+N`.

**Verification:**
- Tests and stories. The Overview story shows a "Directions" grid: 6 states × light/dark.
- Visual check against `ZibbyCorp Directions.dc.html`.

**Commit:** `feat(ds): AgentGlyph, StatePill, CellStrip`

---

## ZA-04 — Data and layout components (parallel with ZA-05)

**Path:** `libs/design-system/src/components/<Name>/**` (all new).

All anatomy follows DS.md §8 and recon 05 §3, 06 §6, 07 §5.

| Component | Props (summary) | Used by |
|---|---|---|
| `SectionLabel` | `index?: number` (rendered `03 —`), `children`, `action?` | every section |
| `SegmentedControl` | `items: {value,label,dot?:StateTone}[]`, `value`, `onChange`, `size` | filters, theme, AUTO/ASK |
| `MetricStrip` | `items: {label,value,hint?}[]`, `columns: 3\|4` | dept header, profile, approvals, runs, company |
| `DataTable<T>` | `columns: {key,label,width: ColumnWidth,align?,render?}[]`, `rows: T[]`, `getRowKey`, `onRowClick?`, `rowHref?`, `empty`, `loading`, `stickyHeader` | tasks, runs, approvals, registries, budgets |
| `FilterBar` | `children` (slots: SelectField / SegmentedControl / SearchInput), `onClear?`, `actions?` | tasks, runs, log, people |
| `LogStream` + `LogLine` | `lines: {id,ts,state?,source?,text}[]`, `caret` on the newest, `paused`, `max`; virtualised only if >500 | activity log, profile, dock |
| `ChainRouteStrip` | `steps: {code,name,state,pipeline?,selected?}[]`, `gates: {mode:"auto"\|"ask"\|"silent", onClick?}[]`, `size: "full"\|"compact"\|"chip"`, `onStepClick?` | tasks, task detail, new task, chains |
| `PipelineStepStrip` | `phases: {label,state,loopBack?}[]`, `current?` | dept pipelines, task detail |
| `GateToggle` | `mode`, `onChange?` (absent = read-only) | chains, policy |
| `BudgetMeter` | `label`, `value`, `max`, `warnAt?`, `stopAt?`, `caption?` | ledger, header |
| `LimitBar` | a compact header variant of BudgetMeter (5H / WEEK) | header |
| `Slider` | `value`, `min`, `max`, `step`, `onChange`, `label`, `format?` | spend thresholds |
| `DiffView` | `hunks` or `unified: string`, `stat?: {files,additions,deletions}` | approval sheet |
| `ConfirmDeleteButton` | two-click confirm; `onConfirm`, `label?`, `confirmLabel?` | replaces the per-feature confirm-delete variants (NC1 left 1) |
| `OrgNode` | `code`, `name`, `cells: StateTone[]`, `alert?: {state,label}`, `selected?`, `href` | org map |
| `Legend` | `items: {state,label,count}[]` | org map, people |
| `EmptyState` | `title`, `body?`, `action?` | everywhere |

- **OrgNode** is a DS component, not an app composite, because the app cannot style
  (D-007). The same reasoning applies to every "domain composite" in recon: if it needs
  layout or styling, it goes to the DS under a generic name.

**Verification:** tests and stories for each component; `tsc -p libs/design-system`.

**Commit:** 2–3 commits grouped by the table.

---

## ZA-05 — Overlay and navigation components (parallel with ZA-04)

| Component | Props | Notes |
|---|---|---|
| `Sheet` | `open`, `onClose`, `side: "right"`, `width: SheetWidth`, `title`, `footer`, `children` | Side sheet (focus trap, Esc, aria-modal) for approval detail and pipeline editing. Not a Dialog (I-5). |
| `CommandPalette` | `open`, `onOpenChange`, `groups: {label, items: {id,kind,label,meta?,href?,onSelect?}[]}[]`, `query`, `onQueryChange`, `loading` | Centred top overlay, keyboard navigation, ⌘K is bound by the consumer. It reuses SearchMenu internals where possible. |
| `ApprovalCard` | `glyphSeed`, `agentName`, `meta`, `waited`, `request`, `taskRef?`, `highRisk`, `onApprove`, `onDeny`, `onOpen`, `density: "card"\|"row"` | DS.md §8 Approval card. When `highRisk`, it renders a `HoldButton` instead of single-click approve (O-13). |
| `SubNav` | `items: {href,label,active}[]`, `actions?` | Section tabs; uses Tabs `mono`. |
| `Breadcrumb` | `items` | Mono, used on detail pages. |

**Commit:** `feat(ds): Sheet, CommandPalette, ApprovalCard, SubNav, Breadcrumb`

---

## ZA-06 — Shell components + Splash

**Paths:** new DS components `AppFrame`, `AppHeader`, `Rail`, `ChatDock`, `Splash`,
`Wordmark`.

**Deliverables**

1. **`AppFrame`** holds the slots `header`, `subnav`, `rail?`, `dock?` and `children`.
   - Grid layout per DS.md §5: header 56, rail 280 on the left, content max 1320 with the
     24px grid background.
   - Below 1024px the rail collapses to a toggleable drawer. At 390px there is no
     horizontal scroll.
   - A skip link is built in (replacing `components/layout/SkipLink`).
2. **`AppHeader`** holds the slots `wordmark`, `nav` (Tabs mono), `operator`,
   `activeCount`, `limits`, `search` (a trigger button showing `⌘K`) and `settingsHref`.
3. **`Rail`** takes `title` ("NEEDS YOU"), `count`, `children` and `empty`.
4. **`ChatDock`** has collapsed and expanded states.
   - Slots: a transcript (LogStream-like message list), a composer (TextArea + attach +
     mic + send), a target chip (O-20) and a latest-line preview when collapsed.
   - It is presentational only. The engine is wired in ZB-12.
5. **`Splash`** is the choreographed boot per `ZibbyCorp Splash.dc.html`: a glyph walk,
   then the wordmark reveal.
   - Props: `ready: boolean`, `onDone`.
   - It must never swallow clicks after `onDone`: `pointer-events: none` once fading.
     This avoids the BootSplash gotcha.
   - Reduced motion means an instant fade.
   - Everything under `apps/web/components/LoadingScreen/*` is ported into it; those app
     files are deleted in ZA-07.
6. **`Wordmark`** renders "ZIBBYCORP", mono 13/600/.18em.

**Commit:** `feat(ds): AppFrame, AppHeader, Rail, ChatDock, Splash`

---

## ZA-07 — Lint wall + migrate the 20 `className` files

**Paths:** `eslint.config.mjs` and the files below.

| File | Migration |
|---|---|
| `apps/web/app/layout.tsx` | Font variables via DS `ThemeScript`/`fontVariables` prop, or `<html>` attrs from a DS helper; no className |
| `apps/web/components/LoadingScreen/*` (7 files) | **Delete** → DS `Splash`; `BootSplash` uses `Splash` |
| `apps/web/components/MarkdownProse/MarkdownProse.tsx` | → DS `Markdown` `variant="prose"` (add the variant) |
| `apps/web/components/layout/ImmersivePage/ImmersivePage.tsx` | Temporary: wrap with DS `Container`; deleted in ZB-13 |
| `apps/web/components/layout/SkipLink/SkipLink.tsx` | → DS (part of `AppFrame`); until ZB-01, a DS `SkipLink` export |
| `apps/web/features/chat/components/{ChatScreen,ChatToolDock,StatusPill}.tsx` | Replace className with DS layout props (`Stack`/`Container`); these screens are deleted in ZB-13 but must lint clean now |
| `apps/web/features/pipelines/components/PipelineDialog/{AgentNode,EdgeControls,PipelineDialog}.tsx` | New DS primitives where needed (`GraphNode`, `GraphEdgeControls` under `components/Graph/`); the canvas stays |
| `apps/web/features/runs/components/{PipelineStageTimeline,RunDetail}.tsx` | DS `PipelineStepStrip` / `Stack` |
| `apps/web/features/departments/components/DepartmentDrawer/DepartmentDrawer.tsx` (renamed in ZC-04) | DS `Sheet`; the drawer is deleted in ZB-03 |

**ESLint** (D-007), for the `apps/web/**` block except stories:

```js
"react/forbid-dom-props": ["error", { forbid: ["style", "className"] }],
"no-restricted-syntax": ["error", { selector: "JSXAttribute[name.name='className']", message: "apps/web composes from DS — no className (D-007)" }],
"no-restricted-imports": ["error", { paths: ["clsx","tailwind-merge","class-variance-authority"], patterns: ["*.css", "!@zibby/design-system/*.css"] }],
```

Adapt the `patterns` syntax to what ESLint accepts. The DS global stylesheet import in
`layout.tsx` must remain allowed.

**DoD:**
- `pnpm check:lint` is green.
- `git grep -n 'className' apps/web -- ':!**/*.stories.tsx'` is empty.
- The app boots, and the Splash plays once and releases clicks. Verify this live in the
  browser, because jsdom misses pointer-events.

**Commit:** `feat(web)!: no-className lint wall; migrate last 20 files to DS`

---

## ZA-08 — Part A validation → park

- The ZC-06 check list.
- A Storybook static build.
- A live-browser pass over **every existing route** in dark (still the default) and light
  (via the toggle), at 1440 and 390 px.
  - Record regressions as screenshots in `.playwright-mcp/` (gitignored).
  - Fix blocking regressions: unreadable text, invisible controls, overflow.
  - Cosmetic mismatches on old screens are expected; Part B replaces them.
- `PROGRESS.md` gets the PR draft.
