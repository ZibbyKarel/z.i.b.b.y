# /chat top bar — 1:1 Design Alignment Spec (Velín-D phase 3b)

> Companion plan: `docs/superpowers/plans/2026-07-14-topbar-alignment.md`.
> Design extraction (authority for every target value): `.superpowers/sdd3/design-topbar.md`.
> Current-code intel: `.superpowers/sdd3/current-topbar.md`.
> Ledger + operator decisions: `.superpowers/sdd3/progress.md`.
> Executes AFTER phase 3a (`docs/superpowers/plans/2026-07-14-status-flyout.md`) on the same
> branch `feat/status-flyout`.

---

## 1. Scope

Make the `/chat` top bar match the Velín-D design **1:1**. The bar contains **exactly five
elements**, left → right:

1. **Status line** (with the 3a hover flyout) — already present, glass-wrapped.
2. **Searchbox** — 190×40 ⌘K trigger; restyle to render *through* the glass (kill its opaque fill).
3. **Limits** — reuse the existing `LimitsRings` (already correct + glass-wrapped).
4. **HUD-UI switch** — NEW: a 40×40 circular glass icon link → `/overview`.
5. **Language selector** — reshape from the always-expanded `ButtonGroup` to the design's compact
   code-only dropdown; fix the double-glass nesting.

**#1 concern — panel transparency fidelity.** Every element must render through a **single**
`GlassSurface` layer with **no opaque override** inside it and **no doubled** glass/blur. The DS
glass tokens already byte-match the design recipe (§5); the work is ensuring nothing defeats them.

**Removed for 1:1 (design has neither):** the butler-sign / mode-label / mode-dot group and the
clock. See §9 — removal is one reversible task; the orphaned `chat.modeLabel` key is cleaned in the
i18n task.

**Out of scope (later phases):** the search MODAL restyle (`ChatPalette`); the status-flyout itself
(shipped in 3a); the limits detail-popover glass restyle (see §6.3 deviation); any HUD-side chrome.

**Park at the PR gate** — no push, no PR without operator instruction.

---

## 2. Assumed 3a end state (this plan builds on it — do not re-do)

Phase 3a runs first on `feat/status-flyout`. When 3b starts, these are already true:

- `StatusPill.tsx` root is a raw `<div className="rounded-full border border-border px-[14px] py-[6px]"
  id={STATUS_PILL_DOM_ID} data-testid={StatusPillTestId.Root} …>` with its `working`/`waiting`
  segments as `<button>` flyout triggers and `report` as a plain count. `STATUS_PILL_DOM_ID =
  "chat-status-pill-root"`. **3b touches this file only to remove the redundant inner border** (§4.6)
  — every 3a hook, ref, testid, ARIA and the portalled `StatusFlyoutPanel` mount stay untouched.
- `StatusFlyoutPanel`, `useStatusFlyout`, `statusFlyout.ts`, `FlyoutWorkRow`, `FlyoutApprovalRow`
  exist. 3b does not import or change them.
- i18n keys `chat.statusPill.flyout.*` exist. 3b does not touch them.
- `ChatTopBar.tsx` still wraps `StatusPill` in `<GlassSurface radius="pill">` and still renders the
  mode group + clock (3a did not touch the bar). 3b removes the mode group + clock and restructures.

3b must **not** duplicate or conflict with any 3a work. All 3b edits to `StatusPill.tsx` are additive
to the post-3a file.

---

## 3. Element inventory & target geometry (verbatim from `design-topbar.md`)

All five bar-level triggers share the **identical** glass recipe (§5); only geometry differs. Radius
is pill `9999px` on all bar elements (not `rCtl`/`rPanel`). Uniform inter-element gap `10px`.

| # | Element | Target W × H | Radius | Glass | Notes |
|---|---|---|---|---|---|
| — | `<header>` bar | auto × **56px**, padding `0 22px` | — | none (transparent) | `position:relative`, `overflow:visible` |
| 1 | Status pill | 411 × 40 | 999 | yes | width content-driven (Czech copy); glass single-layer |
| 2 | Searchbox | **190** × 40 | 999 | yes | icon `search` 13px, placeholder `Hledat…` 12.5px, `⌘K` chip |
| 3 | Limits trigger | 119 × 41 (rings 30×30) | 999 | yes | reuse `LimitsRings` as-is |
| 4 | HUD switch | **40 × 40** (circle) | 999 | yes | `grid` glyph 13px, color `#9aa7b4`, link → `/overview` |
| 5 | Lang trigger | auto × 40 | 999 | yes | code-only (`CZ`/`EN`) accent `#5b8def`, chevron rotate |

**Spacing-token reconciliation (design → DS grid):**
- Inter-element gap `10px` has **no** DS spacing token (grid is 8/12 = `"100"`/`"150"`). Keep the bar's
  existing `gap="150"` (12px) — the nearest token; a 2px delta is an accepted micro-deviation
  (transparency, not gap, is the fidelity concern). Documented in §11.
- Horizontal inset `22px` already exists on the ChatScreen bar wrapper as `px-[22px]` (raw Tailwind,
  1:1) — keep it there; the header adds no horizontal padding (net 22px).
- Bar height `56px` set on the header `Container` (`height="56px"`) with the row vertically centered;
  the ~40px pills then centre with ~8px breathing above/below (matches design).

**Widths that ARE hard-set in code** (fixed design values): searchbox `190px`, HUD switch `40×40`.
**Heights** stay content-driven with `align="center"` (forcing fixed px heights risks clipping
localized content) — the `~40px` target is confirmed by the live-verify checklist (§8), which jsdom
cannot measure anyway.

**Colors referenced** (already DS tokens): `ink2 #9aa7b4` → `foreground-dim`; `ink3 #66737f` →
`foreground-faint`; `accent #5b8def` → `accent`.

---

## 4. Component contracts — props & TestId enums

### 4.1 DS `SearchBar` — additive `surface` variant (`libs/design-system/src/components/SearchBar/SearchBar.tsx`)

Today `SearchBar`'s own chrome is opaque (`bg-background border border-border`), which sits inside the
glass pill and defeats its transparency. `SearchBar`'s only live consumer is `ChatTopBar` (the two
other grep hits are comments), but the DS-correct fix is an **additive** variant, not a base mutation.

```ts
export interface SearchBarProps {
  placeholder: string;
  ariaLabel: string;
  shortcut?: string;
  title?: string;
  onClick?: () => void;
  ref?: Ref<HTMLButtonElement>;
  /** Chrome fill. "solid" (default) keeps the opaque input look; "transparent"
   * drops the own background + border so a surrounding GlassSurface shows through. */
  surface?: "solid" | "transparent";
}
```

- `surface` default `"solid"` → **byte-identical to today** (no consumer changes unless opted in).
- `surface="transparent"` → swap `bg-background border-border` for `bg-transparent border-transparent`;
  keep the hover text/border transitions (hover may brighten the border via `hover:border-border` —
  the glass wrapper's own border still reads through). `TestId` enum unchanged (`SearchBarTestId`).

### 4.2 DS `Dropdown` — additive `compact` on single-select (`libs/design-system/src/components/Dropdown/Dropdown.tsx`)

The DS `Dropdown` (variant `inline`, size `sm`) is already documented as the language-switcher's
intended control (its own JSDoc names it) — portalled `MenuSurface`, chevron rotate, accent border on
open, code + label rows, check on the selected row. The one gap: the **single** trigger always renders
the full `label` beside the `code`; the design's top-bar trigger shows the **code only**.

```ts
export interface DropdownSingleProps<T extends string = string> extends DropdownBaseProps<T> {
  multi?: false;
  value: T;
  onChange: (value: T) => void;
  /** Trigger shows only the option `code` (falls back to `label` when no code),
   * omitting the full label — for dense chrome like the top-bar language switch.
   * The menu rows are unaffected (full labels remain). */
  compact?: boolean;
}
```

- When `compact && !isField`: the single trigger renders `code` (or `label` fallback) + chevron only —
  the `<span>` carrying `current.label` is not rendered.
- Non-compact and field/multi behaviour unchanged. `DropdownTestId` unchanged.

### 4.3 `LangSwitch` (`apps/web/features/chat/components/LangSwitch.tsx` — REWRITE)

Replace the `ButtonGroup` + **inner** `GlassSurface` (the double-nest) with the DS `Dropdown`. Keep the
cookie mechanics verbatim (`writeLocaleCookie` + `router.refresh()`).

```ts
// Renders (no wrapping GlassSurface — the bar supplies the single glass layer):
<Dropdown
  aria-label={t("langSwitcherLabel")}   // existing key: topbar.langSwitcherLabel
  compact
  onChange={setLocale}                   // guards + cookie + refresh, unchanged
  options={[
    { value: "cs", code: "CZ", label: "Čeština" },
    { value: "en", code: "EN", label: "English" },
  ]}
  size="sm"
  value={locale}
  variant="inline"
/>
```

- Endonym labels (`Čeština`/`English`) stay inline data (they read the same in every UI locale — the
  design hardcodes them likewise; no new catalog key).
- `LangSwitchTestId` enum is retained for continuity; the component's test selects the Dropdown trigger
  (`DropdownTestId.Trigger`) — the bar-level `ChatTopBarTestId.Lang` still addresses the wrapper.

### 4.4 `ChatTopBar` (`apps/web/features/chat/components/ChatTopBar.tsx` — RESTRUCTURE)

```ts
export enum ChatTopBarTestId {
  Root = "chat-top-bar",
  Search = "chat-top-bar-search",
  Hud = "chat-top-bar-hud",     // NEW
  Lang = "chat-top-bar-lang",
  // REMOVED: Mode, Clock
}

export interface ChatTopBarProps {
  onOpenPalette: () => void;    // `mode` prop REMOVED (only the deleted mode group used it)
}
```

Root becomes a `Container as="header"` (height 56, `position="relative"`, `overflow="visible"`) holding
one `Stack align="center" direction="row" gap="150"` with **exactly five** children in design order:
status pill (glass), searchbox (glass, `surface="transparent"`, width 190), limits (glass, unchanged),
HUD switch (glass, new), lang (glass, single-layer). No mode group, no clock, no `useNow`, no `Intl`
clock formatter.

### 4.5 HUD switch (inline in `ChatTopBar`, precedent: `ChatToolDock` icon links)

A 40×40 circular glass icon link to the HUD overview. Mirror `ChatToolDock`'s sanctioned icon-link
Tailwind chrome (`text-foreground-dim … hover:text-accent`) on a Next `<Link>`:

```tsx
<GlassSurface data-testid={ChatTopBarTestId.Hud} radius="pill" style={{ width: 40, height: 40 }}>
  <Link
    aria-label={t("hudSwitchLabel")}          // NEW key: chat.hudSwitchLabel
    className="flex size-10 items-center justify-center text-foreground-dim outline-none transition-colors hover:text-accent focus-visible:text-accent"
    href="/overview"                           // typed Route (NAV_ITEMS[0])
  >
    <Icon name="grid" size="sm" />
  </Link>
</GlassSurface>
```

### 4.6 `StatusPill` fidelity (`apps/web/features/chat/components/StatusPill.tsx` — MINIMAL EDIT)

The 3a root carries `border border-border`; wrapped in the bar's `GlassSurface` (which already draws a
`1px` glass border), this produces **two** concentric flush borders — the design has one. Remove
`border border-border` from the root `className`, keeping `rounded-full px-[14px] py-[6px]` and **every**
3a attribute/handler/ref/id/testid intact.

```
- className="rounded-full border border-border px-[14px] py-[6px]"
+ className="rounded-full px-[14px] py-[6px]"
```

---

## 5. Visual contract — the glass recipe (transparency #1)

The design's shared `vdGlassStyle` (`design-topbar.md` §1) is **already** the DS glass token set — a
byte-for-byte match (`current-topbar.md` §2). **No new tokens, no bespoke glass CSS.** Verbatim:

```
--gradient-glass:     linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5))
--blur-glass:         blur(22px) saturate(180%)
--color-glass-border: rgba(255,255,255,0.12)
--shadow-glass:       inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42)
```

**The whole 3b transparency job = every bar element renders through exactly ONE `GlassSurface`, with
nothing opaque inside it and no doubled glass:**

| Fidelity risk (from `current-topbar.md` §8) | Fix | Task |
|---|---|---|
| `SearchBar` opaque `bg-background border-border` inside the glass pill | `surface="transparent"` variant | §4.1 / §4.4 |
| `LangSwitch` double-`GlassSurface` (its own + the bar's) → doubled blur/tint | drop inner `GlassSurface`, use `Dropdown` | §4.3 |
| `StatusPill` inner `border-border` doubling the glass border | remove inner border | §4.6 |
| bar has no glass of its own (correct) | header stays transparent; each child owns its glass | §4.4 |

The DS `GlassSurface` (`GlassSurfaceProps`: `radius`, `children`, `style` passthrough, `data-testid`)
is the single home of the recipe; every element uses `radius="pill"`. Fixed widths ride the `style`
passthrough (sanctioned for genuinely-dynamic values).

---

## 6. Interaction contract

### 6.1 Searchbox
Unchanged trigger contract: `onClick` → `onOpenPalette` (the 3a/existing `ChatPalette` toggle); global
`⌘K`/`Ctrl+K` listener in `ChatScreen` unchanged. Only chrome (transparency + width) changes.

### 6.2 Language selector
`Dropdown` single-select: click (or Enter/Space/ArrowDown) opens the portalled menu; border turns
`accent` while open; chevron rotates 90°; picking a row fires `onChange(id)`, closes, returns focus to
the trigger; Escape/outside-click/Tab close it. `onChange` runs the existing guard → `writeLocaleCookie`
→ `router.refresh()`. Keyboard + portal + outside-click are all provided by `Dropdown` (no custom
wiring).

### 6.3 HUD switch
A plain `<Link href="/overview">` — one-way navigation to the HUD overview (the design's literal
"switch to HUD UI"). No toggle state, no shortcut. Hover/focus brighten the icon to `accent`.

### 6.4 Limits — deliberate NON-change (documented deviation)
`design-topbar.md` §2c shows the limits *detail popover* as glass (`blur(28px)`), but the current
`LimitsRings` popover is a solid `Card` — consistent with the app-wide solid-popover convention (the
same call 3a made for its flyout). The **bar mandate targets the five triggers' transparency**, and the
limits **trigger** is already glass-wrapped and correct. 3b **reuses `LimitsRings` unchanged** and does
**not** restyle its popover to glass. Rationale in §11.

---

## 7. i18n key table (all edits confined to the ONE i18n task)

| Key | cs | en | Action |
|---|---|---|---|
| `chat.hudSwitchLabel` | `Přepnout na HUD` | `Switch to HUD` | **ADD** (aria-label for §4.5) |
| `chat.modeLabel` | `CHAT` | `CHAT` | **REMOVE** (mode group deleted; confirm `ChatTopBar` was sole consumer first) |
| `topbar.langSwitcherLabel` | *(existing)* | `Interface language` | reuse, no change |
| `chat.palette.placeholder` | *(existing)* | *(existing)* | reuse, no change |

Endonym option labels `Čeština`/`English` are inline data (§4.3), not catalog keys. Update
`parity.test.ts` to require `chat.hudSwitchLabel` in both catalogs and to NOT require `chat.modeLabel`.

---

## 8. Testing strategy (jsdom vs live)

**jsdom unit tests** assert *structure*, not pixels:
- DS `SearchBar`: `surface="transparent"` root has no `bg-background`; default still solid.
- DS `Dropdown`: `compact` single trigger shows the `code`, not the `label`; non-compact still shows both.
- `LangSwitch`: renders a Dropdown trigger with `CZ`; selecting `EN` calls the cookie writer + refresh;
  no inner `GlassSurface`.
- `ChatTopBar`: `Root`/`Search`/`Hud`/`Lang` present; `Mode`/`Clock`/mode-dot **absent**; HUD link points
  at `/overview`.
- `StatusPill`: root `className` no longer contains `border-border` (all 3a testids still present).

**Live `:3000` verify (mandatory — jsdom cannot see glass/geometry):** the transparency 1:1 checklist,
compared against `design/Z.I.B.B.Y/ZIBBY Velin-D.html` (see plan Task 8):
- all five elements read as **one** glass layer each — the orb map blurs through every pill, no opaque
  rectangle inside the searchbox, no doubled tint on the lang pill, single border on the status pill;
- left→right order + widths (~190 search, 40×40 HUD circle) match the design; bar height ~56;
- lang dropdown opens with accent border + chevron rotate; picking EN switches UI language;
- HUD icon link navigates to `/overview`;
- mode group + clock are gone.

---

## 9. Removals (mode group + clock) — reversibility

The butler-sign + mode-label + mode-dot group and the clock are **not in the design**. They are removed
as **one dedicated, reversible task** (revert = revert that one commit):
- `ChatTopBar.tsx`: delete the mode `Stack` (Icon `butlerSign`, `Typography modeLabel`, `StatusDot
  chat-screen-mode-dot`) and the clock `Typography`; drop `useNow`, the `Intl` clock formatter,
  `MINUTE_MS`, the `mode` prop, `ChatMode`/`MODE_DOT` imports, and the `Mode`/`Clock` enum members.
- `ChatScreen.tsx`: drop `mode={mode}` from the single `<ChatTopBar …>` call (the `mode` variable stays —
  it drives other chat state). Check `ChatScreenTestId.ModeDot` / any test asserting `chat-screen-mode-dot`
  and update: the mode dot is intentionally gone from the bar.
- `ChatTopBar.test.tsx`: drop the two clock assertions; assert the new element set instead.
- i18n `chat.modeLabel` removal happens in the **i18n task** (catalog-edit law), not here — the key is
  briefly orphaned in between (harmless).

---

## 10. Acceptance criteria

1. The `/chat` bar renders **exactly five** elements in design order: status · search · limits · HUD ·
   lang. No mode group, no clock.
2. Every element renders through a **single** `GlassSurface`: searchbox is transparent (no
   `bg-background`), lang is single-glass (no inner `GlassSurface`), status pill has one border. Verified
   live against the design HTML.
3. Searchbox is 190px wide, keeps its `⌘K` trigger contract. Limits reused unchanged.
4. HUD switch is a 40×40 circular glass link to `/overview` with the `grid` glyph.
5. Language selector is a compact code-only (`CZ`/`EN`) `Dropdown` with accent-on-open border + chevron;
   locale switch still writes the cookie + refreshes.
6. DS changes are additive (`SearchBar.surface`, `Dropdown.compact` single) — defaults unchanged, no
   other consumer affected.
7. Gates green (`check:lint`, `check:types`, `tsc -p apps/web`, `pnpm test`), ignoring only the ledger's
   documented pre-existing flakes. Parked at the PR gate.

---

## 11. Deviations from the design (documented, deliberate)

- **Inter-element gap 12px, not 10px** — no 10px DS spacing token exists; `gap="150"` is the nearest and
  is already in place. 2px, invisible in practice.
- **Limits popover stays a solid `Card`, not glass** — matches the app-wide popover convention (and 3a's
  flyout); the bar mandate concerns the five *triggers'* transparency, all of which are satisfied.
- **Element heights content-driven (~40px), not pixel-forced** — avoids clipping localized content;
  visual match confirmed by the live checklist. Only fixed *widths* (search 190, HUD 40) are hard-set.
- **Lang trigger keeps the `Dropdown`'s own 1px control border** inside the glass — the *doubled blur/tint*
  (the actual transparency bug) is eliminated; a hairline control border is not a transparency defect and
  matches the DS control vocabulary. Flagged in the live checklist as acceptable.
</content>
</invoke>
