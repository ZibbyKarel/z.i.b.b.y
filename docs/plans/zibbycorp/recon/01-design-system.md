# z.i.b.b.y Design System — Inventory for Re-skin Planning

Scope: `libs/design-system` (package `@zibby/design-system`), plus how `apps/web`
consumes it. Compiled 2026-09-24. All paths relative to repo root
`/Users/zibby/Workspace/z.i.b.b.y`.

---

## 1. Tokens & theming

### File map

| File | Role |
| --- | --- |
| `libs/design-system/src/tokens.ts` (214 lines) | `Theme` interface (single source of visual truth, flat object), `Spacing`/`Padding`/`Size` types, `spacingValues`, `resolvePadding`, `mergeTheme`, `tokensToCssVars` |
| `libs/design-system/src/stateTone.ts` (64 lines) | `StateTone` 5-value enum + resolvers |
| `libs/design-system/src/themes/darkTheme.ts` (70 lines) | Concrete dark `Theme` values ("tichý velín") |
| `libs/design-system/src/themes/lightTheme.ts` (68 lines) | Concrete light `Theme` values — **explicitly a structural stub**, `// TODO: design light palette (future sprint)`; glass tokens are literally copy-pasted from dark ("the app mounts dark-only... out of scope") |
| `libs/design-system/src/DesignSystemContext/themeRegistry.ts` | `tokensForTheme(theme)`, `defaultDarkTokens`, `defaultLightTokens` — maps `"dark"|"light"` → concrete Theme |
| `libs/design-system/src/DesignSystemContext/DesignSystemProvider.tsx` (68 lines) | Injects `Theme` as inline CSS custom properties on a root div, sets `data-theme`, exposes Context |
| `libs/design-system/src/DesignSystemContext/hooks.ts` | `useTokens()` (raw JS Theme access), `useSpacing()` |
| `libs/design-system/src/theme/globals.css` (534 lines) | Tailwind v4 `@theme` block + `@layer base` + all `@keyframes` |
| `libs/design-system/src/theme/LIVING-STATE.md` (130 lines) | The living-state contract doc (StateTone + LivingGlow) |
| `libs/design-system/src/visualStyles.ts` | Referenced in SKILL.md as "pure style helper functions" (component-level, not global tokens) |

The app does **not** import `globals.css` from the DS package — `apps/web/app/globals.css`
(not read in full here, but per SKILL.md) re-imports it and adds
`@source "../../libs/design-system/src"` for cross-package Tailwind class detection.

### `Theme` interface — full token inventory (tokens.ts:73–147)

29 properties, grouped:
- **Backgrounds (6):** `colorBackgroundDeep`, `colorBackground`, `colorSurface`, `colorElevated`, `colorRaised`, `colorHover` — "exactly 3 surface levels + deep shell layer" per dark theme comment.
- **Foreground (3):** `colorForeground`, `colorForegroundDim`, `colorForegroundFaint`.
- **Borders (2):** `colorBorder`, `colorBorderStrong`.
- **Accent (4):** `colorAccent`, `colorAccentDim`, `colorAccentContrast`, `colorAccentGlow` — "interaction/selection/brand only (NOT the running state)"; context-switchable home=amber/work=sky via `contextTokens(context)` (mentioned in SKILL.md, not yet re-verified against current `Theme` shape — `colorHome`/`colorWork` appear in SKILL.md's older doc but are **not** in the current `Theme` interface; likely stale doc text, see §5).
- **Semantic status (4):** `colorOk`, `colorWarn`, `colorDanger`, `colorRun` ("deliberately distinct from the interaction accent").
- **Risk categories (4):** `colorRiskPayment`, `colorRiskDeletion`, `colorRiskPush`, `colorRiskSend` — "the only categorical palette".
- **Radii (5):** `radiusDefault`, `radiusSm`, `radiusMd`, `radiusLg`, `radiusFull`. Dark/light both use rCtl=6px (controls/chips) and rPanel=10px (panels/modals) — i.e. radiusDefault/Sm/Md are all 6px, radiusLg is 10px. Very restrained scale.
- **Shadows (3):** `shadowCard`, `shadowModal`, `shadowGlowAccent`.
- **Liquid-glass "VD_GLASS" recipe (4):** `gradientGlass`, `colorGlassBorder`, `shadowGlass`, `blurGlass` — consumed by `GlassSurface` (immersive layer); this is the "Velín-D" glass chrome group referenced in project memory as immersive/"ZT" tokens.
- **Fonts (2):** `fontSans` (Geist), `fontMono` (JetBrains Mono).

`tokensToCssVars()` flattens all 29 into `--color-*` / `--radius*` / `--shadow*` /
`--gradient-glass` / `--font-*` CSS custom properties.

### `Spacing` scale (tokens.ts:15–29)

14 steps: `0,25,50,75,100,125,150,200,250,300,350,400,450,500` → px
`0,2,4,6,8,10,12,16,20,24,28,32,36,40`. `Padding = Spacing | [Spacing,Spacing] | [Spacing×4]`
(CSS shorthand semantics, no `paddingX`/`paddingY` props anywhere).

### Tailwind v4 `@theme` (globals.css) — additional token groups not in the TS `Theme`

Tailwind's `@theme` block (lines 36–178) is broader than the TS `Theme` — it also defines
defaults that get overridden at runtime by the Provider's inline styles, plus groups that
have **no TS `Theme` equivalent at all** (pure CSS, static):

- **Typography scale (8 steps, 11–30px):** `--text-2xs/xs/sm/caption/base/md/lg/xl/2xl/3xl/4xl/5xl` — comment: "label/micro 11 · data 12 · bodySm 13 · body 14 · title 21 · num 26 · display 30 — legacy size names are snapped onto the scale" (several Tailwind default step names collapse onto the same px value, e.g. `xl`,`2xl`,`3xl` are all 21px).
- **Font weights (4):** normal 400, medium 500, semibold 600, bold 700.
- **Letter spacing (6 named, 2 real values):** `tighter/normal/wide/wider/widest` collapse to essentially 0 / 0.04em / 0.14em, plus `--tracking-mono: 0.3em` for the wordmark.
- **Spacing overrides (3):** `--spacing-5/6/7` overridden to 18/22/26px (HUD scale diverges from Tailwind's default 4px-step scale at those indices).
- **Scene gradient (1):** `--gradient-scene` — radial ellipse background used for page canvas depth.
- **Animations (18 `--animate-*` custom properties)** mapped to keyframes — grouped as: micro-interaction (`zpulse`, `fade-in`, `scale-in`), living-state (`zt-live` 2s — "the only ambient motion in the quiet control room", `zt-spin`, `zt-float` — 3px-cap idle float), boot/loading screen (`orbit-spin`, `ring-pulse`, `logo-breathe`, `ripple`, `letter-in`, `fade-up`, `status-in`, `screen-out`), plus un-tokenized keyframes only used directly by class name: `draw-trace`, `node-appear`, and a whole **voice-mode (`v-*`) family** — `v-orbit-cw/ccw`, `v-breath`, `v-glow-idle`, `v-glow-hot` (tone-parametrized via `--living-color`, backs `LivingGlow`), `v-ripple`, `v-bar-a..e` (5 audio-bar heights), `v-fade-up`, `v-think-spin`, `v-mode-in`, `v-dot-blink`.
- **Misc:** `--color-overlay` (dialog backdrop), `--color-surface-panel`/`--color-surface-glass` (two more translucent surface variants beyond the 4 opaque background levels), `--color-transparent/current/black/white`.
- `--color-*: initial;` wipes Tailwind's entire built-in color scale first — **no default Tailwind colors exist in this app at all**, only the semantic tokens above.

### Dark/light handling

- Dark is the only *fully designed* theme (`darkTheme.ts`). Light (`lightTheme.ts`) is a
  real, complete `Theme` object (all 29 props filled with plausible light values) but is
  explicitly marked a stub and — per project memory — **the app currently mounts
  dark-only** (`<DesignSystemProvider theme="dark">` hardcoded in `apps/web/app/providers.tsx`
  per CLAUDE.md's routing section). A re-skin that wants a light company-metaphor look
  needs to design the light palette essentially from scratch.
- `data-theme="dark"|"light"` on the Provider root drives Tailwind's
  `@custom-variant dark (&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *))`.

### `useTokens()` / `useSpacing()`

Exported from `DesignSystemContext/hooks.ts`, re-exported at package root. Rule (SKILL.md):
**do not use for styling** — Tailwind classes are the styling mechanism; `useTokens()` is
only for raw-JS consumers (SVG `fill=`, canvas, WebGL — e.g. `resolveStateToneHex()` in
`stateTone.ts` reads the *computed* CSS var directly via `getComputedStyle`, not via the hook,
for a frame-safe cached hex value consumed by the Chat-UI orb's WebGL uniform).

### State-tone / living-motion system (`stateTone.ts` + `LivingGlow` + `LIVING-STATE.md`)

Single canonical 5-value vocabulary: `StateTone = "accent"|"ok"|"warn"|"bad"|"run"`.
- `STATE_TONES` (iteration order), `stateToneVar` (CSS `var()` strings), `stateToneHex`
  (hex fallback table mirroring globals.css, cached via `resolveStateToneHex()`).
- Every "is this alive" surface in the app (`Card.tone`, `Corners`/`CornersTone`, approvals
  `UiTone`, chat `SceneColorToken`) derives from this one type — `TagTone`/`DotTone` are
  documented *supersets* (Tag adds the 4 risk categories; StatusDot renames `warn→wait`,
  adds `idle`), not rival vocabularies.
- Animated half is `LivingGlow` (`components/LivingGlow/LivingGlow.tsx`): `tone: StateTone`,
  `intensity: "idle"|"hot"`, optional `breathe`; renders `absolute inset-0`, `aria-hidden`,
  respects `prefers-reduced-motion`. Turned on via `Card living` / `HudPanel live`.
- Rule of thumb documented in `LIVING-STATE.md`: **matte by default**, animate only running /
  awaiting / streaming / erroring.

---

## 2. Component inventory

All components are exported from `libs/design-system/src/index.ts` (381 lines). Every
folder under `components/` and `immersive/` (57 non-form component dirs + 11 `form/`
sub-dirs + 9 `immersive/` dirs = **67 components**, excluding `assets/icons`) has exactly
one `.tsx`, one `.test.tsx`, one `.stories.tsx` — **100% test+story coverage confirmed by
directory scan** (no folder is missing either file).

TestId-enum coverage: 64 of 67 component files define `export enum <X>TestId`. The
remaining components (`DropZoneField`, `ScheduleField`, `SegmentPickerField`, `SelectField`)
are thin `Field`-wrapping compositions with **no root of their own** — they delegate all
DOM/testid surface to `Field` (`FieldTestId.Root/Label/Hint/Error`, wired in
`components/form/Field.tsx`) plus the inner control they wrap (`DropZone`, `SchedulePicker`,
`ButtonGroup`, `Dropdown` respectively), so there's no dead surface — but they are a
**documented-convention exception**, not literal enum-per-component compliance (see §5).

### Primitive layer (`src/components/{Container,Stack,Spacer,Grid,Pressable,Surface}`)

| Component | Purpose | Key props | TestId | Test | Story |
|---|---|---|---|---|---|
| `Container` | Layout primitive: padding/dimensions/position/overflow/flex-child | `padding: Padding`, `as?: ContainerAs`, `CONTAINER_STYLE_KEYS` | ✓ | ✓ | ✓ |
| `Stack` / `Row` | `display:flex` wrapper | `direction`, `gap: Spacing`, `align`, `justify`; `Row` = horizontal Stack | ✓ | ✓ | ✓ |
| `Spacer` | Fixed or flex gap insert | — | ✓ | ✓ | ✓ |
| `Grid` | Grid layout primitive | `cols: GridCols`, `align: GridAlign` | ✓ | ✓ | ✓ |
| `Pressable` | Bare interactive wrapper (no visual opinion) | — | ✓ | ✓ | ✓ |
| `Surface` | (exists, exported) — **zero usages anywhere**, see §5 | — | ✓ | ✓ | ✓ |

Note: `theme/globals.css` still references `@source "../primitives"` — a directory that
**no longer exists** (primitives now live inside `components/`). Stale/broken Tailwind
content-source path (see §5).

### Foundations / generic components (`src/components/*`)

| Component | Purpose | Key props/variants | TestId | Test | Story |
|---|---|---|---|---|---|
| `Icon` | Glyph renderer from `IconName` union; icon set under `assets/icons` | `name`, `size: Size`, `stroke: IconStroke`, `tone` | ✓ | ✓ | ✓ (shared grid, no per-icon stories) |
| `IconTile` | Icon inside a shaped/sized/toned tile | `size`, `shape`, `radius`, `tone: IconTileTone` | ✓ | ✓ | ✓ |
| `EntityHero` | Large hero header block (entity detail pages) | — | ✓ | ✓ | ✓ |
| `Typography` | Text primitive (was likely split Text/Heading in older docs; now unified) | `type: TypographyType`, `variant`, `size`, `weight`, `tone`, `align`, `leading`, `tracking` | ✓ | ✓ | ✓ |
| `Divider` | Horizontal/vertical rule | — | ✓ | ✓ | ✓ |
| `Chip` | Compact tag/label | `size: "sm"|"md"` | ✓ | ✓ | ✓ |
| `Checkbox` | Checkbox control | `size: CheckboxSize` | ✓ | ✓ | ✓ |
| `Tag` | Status/category tag; `riskIcon()` helper | `tone: TagTone` (superset of StateTone + risk kinds) | ✓ | ✓ | ✓ |
| `Kbd` | Keyboard-shortcut glyph | — | ✓ | ✓ | ✓ |
| `SearchBar` | Search input chrome | — | ✓ | ✓ | ✓ (unused in apps/web, used internally by SearchInput/SearchMenu docs) |
| `SearchInput` | Search text input | — | ✓ | ✓ | ✓ |
| `SearchMenu` | Search results dropdown | `SearchMenuItem`/`SearchMenuSection` | ✓ | ✓ | ✓ |
| `Alert` | Inline alert banner | `severity: AlertSeverity` | ✓ | ✓ | ✓ |
| `Card` (+`CardHeader/CardContent/CardFooter/CardActions`) + `Corners` | Compound card container; `Corners` = HUD corner-bracket decoration, `tone: CornersTone` (=StateTone) | `tone`, `living`, `background` | ✓ | ✓ | ✓ |
| `LivingGlow` | Animated tone-pulse overlay (see §1) | `tone: StateTone`, `intensity`, `breathe` | ✓ | ✓ | ✓ |
| `FloatingPanel` | Floating/positioned panel | — | ✓ | ✓ | ✓ |
| `Dialog` (+`DialogBody`) | Modal dialog | `width: DialogWidth` (sm/md/lg/xl/2xl = 360–1000px) | ✓ | ✓ | ✓ |
| `Tabs` (+`Tab`,`TabList`,`TabPanel`) | Tabbed navigation | — | ✓ | ✓ | ✓ |
| `Accordion` (+`AccordionItem`,`Summary`,`Details`) | Collapsible sections | — | ✓ | ✓ | ✓ |
| `Button` | Primary button | `intent: ButtonIntent`, `size: ButtonSize` | ✓ | ✓ | ✓ |
| `HoldButton` | Press-and-hold confirm button (high-risk actions) | `size`, `tone: HoldButtonTone` | ✓ | ✓ | ✓ |
| `Progress` (+`getUsageTone`) | Progress bar | `height: Spacing`, `tone: ProgressTone` | ✓ | ✓ | ✓ |
| `ProgressRing` | Circular progress | `size: ProgressRingSize` | ✓ | ✓ | ✓ |
| `OrbitLoader` | Orbit-style loading spinner | `size: OrbitLoaderSize` | ✓ | ✓ | ✓ |
| `StatusDot` | Status indicator dot | `tone: DotTone`, `pulse` | ✓ | ✓ | ✓ |
| `Toggle` | Switch control | `size: ToggleSize` | ✓ | ✓ | ✓ |
| `Tooltip` | Hover tooltip | `side: TooltipSide` | ✓ | ✓ | ✓ |
| `Panel` | Generic bordered panel (distinct from `Card`, see §5 near-dup note) | — | ✓ | ✓ | ✓ |
| `CodeBlock` | Syntax/code display block | `height: CodeBlockHeight` | ✓ | ✓ | ✓ |
| `Stat` | Labeled stat/metric | `tone: StatTone` | ✓ | ✓ | ✓ |
| `Sparkline` | Inline mini line-chart | — | ✓ | ✓ | ✓ (unused in apps/web) |
| `Markdown` / `MarkdownEditor` | Markdown render / edit | — | ✓ | ✓ | ✓ |

### Form field family (`src/components/form/*`, 11 dirs)

`Field` (the shared chrome — label/hint/error/layout, render-prop pattern handing
`{id,labelId,describedBy,invalid}` to the wrapped control) + 10 concrete fields:
`TextInputField`, `NumberField`, `TextAreaField`, `HighlightTextAreaField` (inline
highlight ranges, `HighlightTone`), `SelectField` (wraps `Dropdown`), `SegmentPickerField`
(wraps `ButtonGroup`), `SchedulePicker`/`ScheduleField` (recurrence picker), `ToggleField`,
`FilePickerField` (unused in apps/web), `DropZoneField` (wraps `DropZone`).
All have test+story; 4 have no own TestId enum (delegate to `Field` + wrapped control, see
above).

### Dashboard chrome (router-agnostic, domain-neutral — "must not import domain types")

| Component | Purpose | Notes |
|---|---|---|
| `ButtonGroup` | Segmented button group | `tone: ButtonGroupTone` |
| `Dropdown` | Single/multi select dropdown, portals to `document.body` | `variant: "inline"|"field"`, `size`, `tone`, `DropdownOption.description` |
| `MenuSurface` | Portal-positioned menu surface primitive | `align: MenuSurfaceAlign` |
| `DropDownButton` | Button that opens a menu | `DropDownButtonItem[]` |
| `MenuButton` | Icon/kebab button + menu | `MenuButtonItem[]` |
| `List` (+`ListItem`,`ListItemIcon`,`ListItemText`,`ListItemBadge`) | Nav/data list; `NavItem` chrome type lives here (not a domain entity) | `ListItem` renders as button/link/div per props+`linkComponent` |
| `DropZone` | Drag-and-drop file zone | `FileAccept`, `FileRejection` |
| `FilePreview` (+`iconForFile`) | File attachment preview chip | — |

Explicitly **not** in DS (per SKILL.md, live in `apps/web`): `TopBar` (domain-neutral chrome
that *is* in DS per SKILL text but not found in current `index.ts` exports — likely moved/
renamed during the HUD→Chat migration; **not present in current index.ts**, a doc/code
drift worth flagging), `MainLayout`, `BrandLogo`.

---

## 3. The `immersive/` layer

`libs/design-system/src/immersive/` — 9 component dirs + shared geometry/state helpers,
exported both from `immersive/index.ts` (hand-authored barrel) and mirrored into the root
`index.ts` (lines 331–380).

**Pure helpers (no DOM):** `ellipseLayout.ts` (orbit position math), `orbState.ts`
(`ORB_MOTION`, `ORB_STATE`, `ORB_STATE_COLOR` enums/maps), `seededRandom.ts`,
`canMountWebGL.ts` (capability check), `useMeasure.ts` (ResizeObserver hook).

**`immersive.css.ts`** — a *runtime* `<style>`-tag injector (`ensureImmersiveCss()`), not a
build-time CSS file: injects one shared `<style>` block into `document.head` on first mount
(idempotent, marked via `data-immersive-css` attr) containing 10 orb-map-specific
`@keyframes` (`imSpin`, `imShadow`, `imRing`, `imHalo`, `imFloat`, `imDash`, `imFlareFly`,
`imFlareBurstRing/Core`, `imFlareLaunch`) ported verbatim from a design prototype
(`design/Z.I.B.B.Y/zibby/velin-d-map.jsx`, `vc*`→`im*` renamed). Deliberately **not** in the
Tailwind `@theme` (one-off orb-map curves, not design tokens) and has its own
`prefers-reduced-motion` media guard.

**Components:**
- `Orb` — WebGL wireframe orb primitive (raw building block).
- `OrbitField` — faux-3D orbiting task dots.
- `OrbNode` — composed subsystem node (orb + chrome + label), built from `Orb`.
- `CoreOrb` — the central ZIBBY orb, built from `Orb`.
- `ConnectorLayer` — SVG connector lines from core to each node.
- `HandoffFlare` — one-shot comet+burst animation between two orbs (`arcPath()` helper, `DEFAULT_DURATION_MS`, `RETIRE_BUFFER_MS`).
- `OrbMap` — composes all of the above into the full subsystem map (`ORB_MAP_CORE_ID`).
- `GlassSurface` — the Velín-D "liquid glass" pane (translucent blur over scene gradient); consumes the `gradientGlass`/`colorGlassBorder`/`shadowGlass`/`blurGlass` Theme tokens directly via inline `style` (the immersive bundle is explicitly exempt from the app-wide `forbid-dom-props` rule — DS owns styling). Has no orb-map dependency; usable standalone.
- `ImmersiveShell` — reusable full-page chrome (grid overlay + back button slot + content id) built for the HUD→Chat migration ("F0", `docs/plans/hud2chat-F0-immersive-shell.md`).

### App routes / components relying on the immersive layer

- `GlassSurface` — heaviest consumer: 12 files including `apps/web/features/chat/components/{ChatLiveLog,ChatToolDock,ChatDock,ChatQuickTask,ChatSearch,LangSwitch,ChatBottomBar,BriefingMessageCard,ChatQuickNote,ChatTopBar}.tsx` and `apps/web/components/HudPanel/HudPanel.tsx` (the app's near-universal panel wrapper, "glass" surface variant).
- `ImmersiveShell` — 3 consumers: `apps/web/components/layout/AppShell/AppShell.tsx`, `apps/web/components/layout/ImmersivePage/ImmersivePage.tsx` (thin app wrapper adding the `next/link` back button DS can't import), `apps/web/features/archive/Screen.tsx`. Per CLAUDE.md/memory, **every route is immersive** post HUD→Chat migration — `ImmersivePage` is the composed-from pattern "every migrated page" uses.
- `OrbMap` / `HandoffFlare` / `OrbitField` — `apps/web/features/chat/components/SubsystemOrbMap.tsx` (the `/chat` route's subsystem map view).
- `Orb` / `OrbNode` — `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx`.
- `LivingGlow` — used directly by `apps/web/components/HudPanel/HudPanel.tsx` for the `live` prop.
- `CoreOrb`, `ConnectorLayer` have **no direct apps/web import** — used only internally to compose `OrbMap`/`OrbNode` (not dead, just not imported by name at the app layer).

---

## 4. Conventions (sealed sizing, raw buttons, testids, tests/stories, a11y, scaffold)

Full detail lives in `.claude/skills/design-system/SKILL.md` (already the canonical
reference — summarized, not duplicated, here):

- **Sealed sizing API:** no raw px/number props anywhere in the public component surface.
  Every size-ish prop is one of `Size` (`xs..xl`), `Spacing` (14-step token), `Padding`,
  `IconStroke`, or `DialogWidth`. Enforced examples: `Icon.size/stroke`, `StatusDot.size`,
  `Progress.height`, `Corners.inset`, `CardContent.padding`, `Container.padding`,
  `Dialog.width`. No `paddingX`/`paddingY` — 2-tuple `[y,x]` or 4-tuple `[t,r,b,l]` instead.
  `Icon` explicitly omits `width`/`height`/`strokeWidth` from its SVG prop spread to close
  the raw-px escape hatch.
- **`className` is banned on every DS component's public Props** (`Omit<Props, "className">`
  everywhere) — DS is sealed, styling only via typed variant/prop APIs. CVA (`class-variance-
  authority`) is the standard variant mechanism; Tailwind classes belong only inside DS.
- **Raw `<button>` in DS bespoke controls is intentional** (role semantics) per project
  memory (`project_ds_raw_buttons.md`) — only pure-reset buttons migrate away from it.
- **`data-testid` convention:** every component declares its own `<Component>TestId` enum,
  one member per meaningful DOM *part* (not per node); repeated/keyed parts suffix the enum
  value with the stable key (e.g. `` `${TabsTestId.Tab}-${value}` ``); polymorphic/spread
  components put `data-testid` **before** `{...rest}` so callers can still override it.
  Tests select exclusively via `getByTestId`/`queryByTestId`/`getAllByTestId` — never
  `querySelector`/`firstChild`/role-or-text-as-selector; roles/ARIA remain as **assertions**
  (`toHaveRole`, `toHaveAccessibleName`, `toHaveAttribute`) on the test-id-selected node.
- **Story convention:** every `.stories.tsx` has **exactly two** named exports, `Overview`
  (static, all variants stacked, no args) and `Playground` (args+`argTypes` driven). No
  third story permitted. Icon is the one documented exception (shared glyph-grid story, no
  per-icon stories/tests).
- **A11y checklist** (enforced pre-merge per SKILL.md, not automated beyond Storybook's
  `@storybook/addon-a11y`): real `<button>`/`<a>` for interactive elements, `aria-label` on
  icon-only controls, `aria-disabled` over `disabled` where focus must remain, visible
  `focus-visible:ring-2` always, WCAG AA contrast (4.5:1 text / 3:1 UI), `Enter`/`Space`/
  `Escape` keyboard handling. Target: WCAG AA.
- **Scaffold process:** `.claude/skills/scaffold-component/SKILL.md` (Czech-language skill)
  generates the canonical 4-file set (component+test+story+export) from a CVA template with
  the mandatory `<Name>TestId` enum, driven by 5 inputs the user supplies (name, variants,
  base HTML element, extra props, interactive-or-not).

---

## 5. Quality gaps

- **`@source "../primitives"` in `theme/globals.css` (line 7) points at a directory that no
  longer exists.** Primitives (`Container`, `Stack`, `Spacer`, `Grid`, `Pressable`,
  `Surface`) now live under `components/`, which the adjacent `@source "../components"`
  line already covers — so this is currently harmless dead config, but it's stale and
  should be cleaned up rather than carried into a re-skin.
- **Unused/orphaned DS exports** (zero references anywhere in `apps/web`, and zero internal
  DS cross-references — i.e. not even used to compose another DS component):
  - `Surface` (`components/Surface/Surface.tsx`) — fully built, tested, storied, never used.
  - `Sparkline` (`components/Sparkline/Sparkline.tsx`) — same.
  - `FilePickerField` (`components/form/FilePickerField/`) — same.
  - `Spacer` (`components/Spacer/`) — same (though it's a primitive that's trivially
    reasonable to keep even if idle).
  Several other exports flagged by a naive "not imported by name in apps/web" grep
  (`ConnectorLayer`, `CoreOrb`, `SearchBar`, `Corners`, `SchedulePicker`) turned out to be
  **false positives** — they're consumed by other DS components internally (`OrbMap` uses
  `ConnectorLayer`/`CoreOrb`; `SearchInput`/`SearchMenu` reference `SearchBar`; `Card`/
  `Panel`/`LivingGlow` use `Corners`; `ScheduleField`/`HighlightTextAreaField`/`List` use
  `SchedulePicker`) — genuinely fine, just not directly named in the app layer.
- **4 form-field components have no own `TestId` enum**: `DropZoneField`, `ScheduleField`,
  `SegmentPickerField`, `SelectField`. This is a defensible pattern (they delegate to
  `Field`'s `FieldTestId` + the wrapped control's own testids) but it's an *undocumented*
  exception to the SKILL.md's "mandatory for every component" rule — worth either codifying
  explicitly or closing.
- **Doc/code drift:** the design-system SKILL.md's "Dashboard chrome" section lists
  `TopBar` as a DS export living in `libs/design-system` alongside `ButtonGroup`/`List` —
  **`TopBar` is not present in the current `src/index.ts`** (381 lines, checked directly).
  Likely superseded by the HUD→Chat migration (topbar chrome moved into
  `ChatTopBar`/immersive components) without the skill doc being updated. Also, SKILL.md's
  token-mapping table mentions `colorHome`/`colorWork` context accent tokens that are
  **not present** in the current `Theme` interface (`tokens.ts`) — another stale reference.
  A re-skin plan should verify current reality (source) over the skill doc's prose in these
  two spots.
- **No true "legacy HUD-era dead component" was found inside DS itself** — the DS package
  appears to have been kept in lockstep with the HUD→Chat/immersive migration (confirmed by
  memory: HUD shell + `/overview` + `/gates` routes were deleted at the *app* layer, but DS
  primitives like `Card`, `Panel`, `Corners`, `StatusDot` are still the active state-tone
  vocabulary, not orphaned relics). The closest things to "HUD-era" survivors are
  **app-layer** composites, not DS: `apps/web/components/HudCard/HudCard.tsx` and
  `apps/web/components/HudPanel/HudPanel.tsx` — these are *not* dead, they are the
  **single most load-bearing composite wrappers in the whole app** (see §6) — `HudCard`
  wraps DS `Card` and is used by essentially every entity-list card (`ProjectCard`,
  `AgentCard`, `TeamCard`, `CompanyCard`, `IntegrationCard`, `HookCard`,
  `McpServerCard`, `SignalKindCard`); `HudPanel` wraps DS `Card`/`GlassSurface` and is used
  by ~50 feature files (nearly every detail-screen panel in the app). Their names retain
  "Hud" branding from the pre-Chat-UI era even though the app is now fully "immersive" —
  a naming/identity artifact a re-skin should confront head-on (these two components *are*
  effectively the reusable "card" and "panel" of the whole app today, despite the DS
  already having `Card`/`Panel`/`GlassSurface` beneath them).
- **`Card` vs `Panel` vs `Surface` vs `GlassSurface` vs `HudCard`/`HudPanel`:** five
  container-ish surfaces exist across DS + app layer with overlapping purpose. `Panel` and
  `Surface` in particular look like near-duplicates of `Card` (all three are generic
  bordered/backgrounded containers); `Panel`'s differentiator from `Card` was not
  determined from export lists alone and should be diffed before a re-skin decides which
  one becomes the canonical "department/employee card" primitive.
- **A `Dropdown.tsx` encoding curiosity:** `libs/design-system/src/components/Dropdown/
  Dropdown.tsx` (644 lines) is reported by `file`/`grep` as a non-ASCII/binary-flagged file
  (likely a stray Unicode character, e.g. a curly quote — project memory notes a similar
  "Czech curly-quote TS break" incident elsewhere). Not a functional bug found here, but
  worth a byte-level lint pass before heavy editing during a re-skin.

---

## 6. Tailwind leakage check — `apps/web`

Per CLAUDE.md/SKILL.md law: apps/web composes only from DS and "never writes its own
Tailwind classes" except "layout utilities in `app/`". Findings:

### `className=` usage in `apps/web` (raw Tailwind strings on DOM elements or passthrough)

- **20 files, 55 total occurrences.** Top offenders (file:count):
  1. `apps/web/features/chat/components/ChatScreen.tsx` — 9
  2. `apps/web/components/LoadingScreen/BrandMark.tsx` — 8
  3. `apps/web/components/LoadingScreen/LoadingScreen.tsx` — 6
  4. `apps/web/features/pipelines/components/PipelineDialog/EdgeControls.tsx` — 5
  5. `apps/web/components/LoadingScreen/BootProgress.tsx` — 5
  6. `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx` — 2
  7. `apps/web/features/pipelines/components/PipelineDialog/PipelineDialog.tsx` — 2
  8. `apps/web/features/chat/components/StatusPill.tsx` — 2
  9. `apps/web/features/chat/components/ChatToolDock.tsx` — 2
  10. `apps/web/components/LoadingScreen/{Wordmark,StatusLine}.tsx` — 2 each
  11. `apps/web/components/layout/ImmersivePage/ImmersivePage.tsx` — 2
  (remaining 9 files at 1 each: `RunDetail`, `PipelineStageTimeline`, `AgentNode`,
  `MarkdownProse`, `LoadingScreen/{Corner,CircuitTraces}`, `layout/SkipLink`,
  `app/layout.tsx`).
  Sample content confirms these are **real raw Tailwind utility strings on bare `<div>`s**,
  not merely passthrough — e.g. `ChatScreen.tsx:224` `className="relative flex h-full w-full
  flex-col overflow-hidden font-sans"`, `SkipLink.tsx:24` a full focus-ring/utility string on
  a raw skip-link `<a>`, `app/layout.tsx:37` `className={\`${geist.variable} ${jetbrainsMono.variable}\`}`
  on `<html>` (font-variable wiring — a legitimate "layout utility" exception).
  **`ChatScreen.tsx` and the whole `LoadingScreen/*` family are self-documented, deliberate
  exceptions** — `LoadingScreen/LoadingScreen.tsx` and its siblings each carry a file-level
  `/* eslint-disable react/forbid-dom-props -- ... */` explaining the brand-specific /
  dynamic-animation rationale; `ChatScreen.tsx` carries the same for being "a bespoke
  JARVIS-style HUD surface." These are the two known, intentional escape zones from the DS
  boundary.
- **The ESLint rule does not actually gate `className`.** `eslint.config.mjs:79`:
  `"react/forbid-dom-props": ["error", { forbid: ["style"] }]` — only `style` is
  mechanically forbidden on raw DOM elements in `apps/web/**/*.{ts,tsx}` (line 75, excludes
  `*.stories.tsx`). **Raw Tailwind `className` strings on DOM elements are not caught by
  any lint rule** — the "never write Tailwind classes outside DS" law is enforced by
  convention/review only, which is exactly why the above 20 files exist. A re-skin that
  wants to guarantee token-driven styling should either add a `className`-forbidding rule
  (with the same escape-hatch pattern) or accept these as a known, bounded exception list.

### `style={{` usage in `apps/web`

- **116 occurrences across 51 files** (much larger surface than `className`). Most of these
  are **not** violations — `react/forbid-dom-props` only targets raw DOM elements; passing
  `style` into a DS component's typed `style?: CSSProperties` passthrough prop (documented
  pattern: "A genuinely dynamic value with no DS prop... goes through a DS component's
  `style` passthrough" per CLAUDE.md) is allowed and is the majority case (e.g. `Container`,
  `GlassSurface`, `Corners` all expose `style`).
- **Only ~19 files carry an explicit `// eslint-disable-next-line react/forbid-dom-props` or
  file-level disable** — i.e. ~19 files/instances are confirmed raw-DOM-element style usage
  requiring the escape hatch: `RuleParts.tsx` (×2), `GlobalRuleCard.tsx`, `RuleCard.tsx`,
  `MemoryGraph.tsx`, `ChatScreen.tsx` (file-level), `ChatSearch.tsx` (2-line clamp,
  `-webkit-line-clamp` has no DS equivalent), `PipelineCanvas.tsx`, `ApprovalPreview.tsx`
  (×3), `SeverityMeter.tsx`, `RunApprovalGate.tsx`, `HudCard.tsx` (no — actually
  `HudPanel/HudPanel.tsx` per grep), and the entire `LoadingScreen/*` family (6 files,
  file-level disables) with named rationale each time (dynamic animation delays, computed
  glow colors, SVG trace coordinates — "no DS prop equivalent").

### Eslint config summary (`eslint.config.mjs`)

- Line 75–80: `apps/web/**/*.{ts,tsx}` (excluding `*.stories.tsx`) → `react/forbid-dom-props`
  errors on raw `style`. Comment explicitly frames this as enforcing "apps/web composes UI
  exclusively from the design system — it never sets inline styles on DOM elements," with
  DS itself exempt ("the design system itself is exempt — it owns the styling layer").
  **No equivalent rule exists for `className`.**

---

## 7. Storybook & test setup

- **Storybook** (`libs/design-system/.storybook/main.ts`): one instance for the whole
  monorepo — story globs cover `libs/design-system/src/**/*.stories.@(ts|tsx)` **and**
  `apps/web/{components,features}/**/*.stories.@(ts|tsx)` **and**
  `libs/forms/src/**/*.stories.@(ts|tsx)`. Framework: `@storybook/react-vite` +
  `@tailwindcss/vite` wired into `viteFinal`. Addons: `@storybook/addon-essentials`,
  `@storybook/addon-a11y`. Notable Vite-layer workarounds: pins esbuild to the automatic
  JSX runtime (Next's `jsx: "preserve"` tsconfig would otherwise break story rendering),
  stubs `next/link`/`next/navigation`, statically replaces
  `process.env.NEXT_PUBLIC_API_URL`, and aliases `@zibby/contracts`/`@zibby/forms` to TS
  source. Toolbar carries `theme` (dark/light) and `context` (home/work) switchers via the
  `DesignSystemProvider` decorator.
  Per SKILL.md, **"Storybook is for `libs/design-system` only"** as a *convention* even
  though the glob technically also picks up app-level `.stories.tsx` files — per SKILL.md,
  "domain composites moved to app... have no stories," i.e. any app-level story files that
  do exist predate/are exceptions to that rule (worth a quick `find apps/web -name
  "*.stories.tsx"` sanity pass before a re-skin touches Storybook config — not exhaustively
  enumerated in this pass beyond the `HudCard`/`HudPanel` stories already noted in §5/§6).
- **Vitest** (`vitest.workspace.ts`, root): 7 projects — `libs/design-system/vitest.config.ts`
  (jsdom+React, `include: ["src/**/*.test.{ts,tsx}"]`), `libs/forms`, `libs/contracts`,
  `apps/api` (node+SWC for Nest decorators), `apps/web/vitest.config.ts` (node, scoped to
  i18n-catalog checks only — no component tests), `apps/web/vitest.components.config.ts`
  (jsdom+React, scoped to `apps/web/components/**` — the "web-components" project per
  project memory), and `.claude/skills/design-match/scripts/vitest.config.ts`.
  `libs/design-system/vitest.config.ts` uses `@vitejs/plugin-react`, `environment: "jsdom"`,
  a `vitest.setup.ts` setup file, `globals: true`.

---

## Implications for a full re-skin ("company" metaphor: departments, employees)

### Changes that are centralized (touch tokens/theme once, propagate everywhere)

- **All flat colors, radii, shadows, spacing, fonts** are one edit away in
  `themes/darkTheme.ts` (+ `lightTheme.ts` if the re-skin wants a real light mode — it
  currently doesn't exist and must be designed from scratch, not just re-themed) plus the
  Tailwind `@theme` defaults in `theme/globals.css` (which must be kept in lockstep — they
  are two independent sources of the same values today: the CSS defaults and the
  TS `Theme` object are hand-duplicated, not generated from one source, so **every token
  change must be made in both files** or the initial paint before the Provider mounts will
  flash the old defaults).
- The **liquid-glass "VD_GLASS" recipe** (`gradientGlass`/`colorGlassBorder`/`shadowGlass`/
  `blurGlass`) is one clean token group to swap for a different chrome material if the
  "company" look wants something other than glassmorphism (e.g. flat cards for an
  "org chart" metaphor) — `GlassSurface` is the single choke point, used everywhere
  chat/immersive chrome appears.
- **State vocabulary (`StateTone`) and the risk-category palette** are also single-source —
  if "departments" get their own identity colors (e.g. Engineering=blue, Sales=green),
  that's naturally a *new* token group parallel to `colorRiskPayment` etc., not a
  per-component change, provided it's threaded through the same `Theme`/`tokensToCssVars`/
  `@theme` triangle.
- **Typography scale, radii, and motion curves** are all centralized and few enough
  (8 text steps, effectively 2 radii, ~18 named animations) that a full re-skin's "does it
  feel like a company/office vs. a control room" decision is largely a token-file edit, not
  a per-component rewrite.

### Changes that are necessarily per-component

- **"Department/employee" as a first-class visual concept has no home yet.** Nothing in the
  current `Theme`/`StateTone`/`IconTileTone` model represents an org-chart entity type —
  today's closest analogues are `colorHome`/`colorWork` "context" (SKILL.md mentions it,
  but it's not in the live `Theme`!) and the risk-category 4-color palette. A department/
  employee identity system (avatars, department badges/colors, role icons) is new surface
  area: likely a new `IconTile` tone set, a new `Tag`/`Chip` variant, and probably a new
  `EntityHero`/`HudCard` visual mode — none of which exist as tokens today, so this is
  real component + token design work, not a re-skin of existing slots.
- **`HudCard` and `HudPanel`** (app-layer, not DS) are the two highest-leverage/highest-risk
  components to touch: `HudCard` is the card shell for essentially every list entity
  (projects, agents, teams, companies, integrations, hooks, mcp servers, signal kinds) and
  `HudPanel` is the shell for nearly every detail-screen section (~50 consumers). Any
  "employee card" / "department panel" redesign almost certainly starts by evolving these
  two, not by adding brand-new DS primitives — but their *names* and current variant model
  (`background`, `radius`, `tone`, `live`, `hud`/`glass` surface switch) are tuned for the
  "quiet control room" metaphor and will need real API rethinking, not just a coat of paint.
- **Icon set** (`assets/icons`) is a closed glyph union (`IconName`) — a company/departments
  metaphor (org chart, briefcase, building, badge icons) needs new glyphs added to that set;
  no shortcut via className/props since `Icon` has no arbitrary-SVG escape hatch by design.
- **The immersive orb-map layer** (`OrbMap`/`Orb`/`OrbNode`/`CoreOrb`/`ConnectorLayer`/
  `HandoffFlare`) is deeply "space/control-room" coded (orbits, WebGL wireframe spheres,
  comet flares) and is load-bearing for the `/chat` route's subsystem visualization and
  `SubsystemDrawer`. A literal "company org chart" metaphor is a fundamentally different
  visual grammar (nodes-and-connectors is reusable via `ConnectorLayer`'s SVG-line approach,
  but the orb/wireframe rendering itself is not); this is the single largest "cannot just
  retheme" risk in the redesign — it may need a parallel org-chart-shaped component family
  rather than a retint of `Orb`/`CoreOrb`.
- **`LoadingScreen/*` and `ChatScreen.tsx`** are the two areas already exempted from the DS
  boundary (file-level `forbid-dom-props` disables, heavy bespoke `className`/`style` use)
  — they will need direct, manual re-authoring under the new visual language rather than
  inheriting it for free from a token swap, since they don't route their visuals through DS
  tokens as cleanly as compliant components do.

### Risks

1. **Token duplication (TS `Theme` vs. CSS `@theme` defaults)** — a re-skin that edits only
   one of `themes/darkTheme.ts` / `theme/globals.css` will get a flash-of-wrong-theme or
   silent drift; needs a disciplined single edit pass across both (or, better, a
   follow-up to generate one from the other before the re-skin starts).
2. **No light theme exists in practice** — if the "company" mockup assumes a lighter, more
   corporate palette, this is net-new design work, not a retint (`lightTheme.ts` is a stub;
   the app doesn't even mount it currently).
3. **Convention-only enforcement of the DS boundary** (`className` isn't lint-gated) means
   the 20 files with raw Tailwind and the ~51 files with raw `style` are exactly where an
   agent-driven re-skin is likely to under- or over-reach — these need explicit inclusion/
   exclusion decisions up front, not discovery mid-implementation.
4. **`HudCard`/`HudPanel` naming and variant API carry "control room" assumptions** baked
   into prop names (`hud`/`glass` surface switch, `live`/`tone` semantics tied to
   `StateTone`) — renaming/re-modeling them touches ~60 call sites across nearly every
   feature area; should be planned as its own migration step, not folded silently into
   visual-only changes.
5. **The immersive orb-map is a genuinely different rendering technology (WebGL)** from the
   rest of the DS (DOM+CSS) — swapping its visual metaphor is not a token change and likely
   needs dedicated design + engineering time separate from the rest of the re-skin.
