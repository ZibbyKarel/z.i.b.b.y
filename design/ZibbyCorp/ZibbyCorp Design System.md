# ZibbyCorp Design System

A visual language for an agent operating system that runs like a company. It is monochrome and technical, like instrument paper or a blueprint: squared corners, 1px hairlines, mono labels and pixel glyphs. The only color in it is **status**. Everything else is ink on paper.

Version 0.1 · 2026-09-24 · derived from `Dashboard.dc.html`

---

## 1. Principles

1. **Color means state.** Chrome is grayscale. Hue is reserved for the six agent states, so any color on screen tells you what is happening.
2. **Hairlines, not shadows.** Structure comes from 1px borders and a background grid. There are no drop shadows or blur in the light theme.
3. **Square everything.** Border radius is 0 throughout. The only round shapes are the status pod and the flow packet.
4. **Two voices.** Geist is for content people read. Geist Mono in UPPERCASE with wide tracking is for labels, IDs, metrics and controls.
5. **Only live things glow.** In the dark theme, active status elements get a soft glow of `--gw`. Nothing else glows, and in the light theme nothing glows at all.
6. **Motion is stepped.** Glyph animations use `steps(1,end)` for a pixel/LCD feel. UI transitions are short (≤ 200 ms).

---

## 2. Color

All tokens are CSS custom properties set on the app root. To switch theme, swap the whole set.

### 2.1 Neutrals

| Token      | Role                                               | Light                | Dark                     |
| ---------- | -------------------------------------------------- | -------------------- | ------------------------ |
| `--bg`     | App background, inset surfaces                     | `#F3F4F2`            | `#0A0B0B`                |
| `--panel`  | Rails, cards, header                               | `#FAFAF8`            | `#101211`                |
| `--panel2` | Selected row, avatar tile, hover                   | `#EDEEEB`            | `#161917`                |
| `--line`   | Default hairline, dividers                         | `#D9DBD6`            | `#232725`                |
| `--line2`  | Control borders, emphasized hairline               | `#BFC2BC`            | `#343936`                |
| `--ink`    | Primary text, selected border, primary button fill | `#111312`            | `#ECEFEA`                |
| `--ink2`   | Secondary text, metadata                           | `#50544F`            | `#A2A8A2`                |
| `--ink3`   | Tertiary text, mono labels, placeholders           | `#8A8E88`            | `#666C67`                |
| `--grid`   | Background grid lines                              | `rgba(17,19,18,.05)` | `rgba(236,239,234,.035)` |

Inverse pairing: a primary button is `background: var(--ink)` with `color: var(--panel)`. It inverts correctly in both themes.

### 2.2 Status (the only hues)

| Token       | State               | Maps from legacy | Light                  | Dark                   |
| ----------- | ------------------- | ---------------- | ---------------------- | ---------------------- |
| `--s-work`  | Working             | running          | `oklch(0.6 0.14 160)`  | `oklch(0.82 0.17 160)` |
| `--s-think` | Thinking            | —                | `oklch(0.58 0.14 250)` | `oklch(0.78 0.13 245)` |
| `--s-block` | Blocked / needs you | waiting          | `oklch(0.7 0.15 70)`   | `oklch(0.84 0.15 80)`  |
| `--s-err`   | Error               | error            | `oklch(0.58 0.2 25)`   | `oklch(0.7 0.2 25)`    |
| `--s-done`  | Done                | report           | `oklch(0.56 0.15 300)` | `oklch(0.78 0.14 300)` |
| `--s-idle`  | Idle                | idle             | `#A9ADA7`              | `#4A504B`              |

Canonical order, used in legends, filters and stacked bars: **working → thinking → blocked → error → done → idle**.

Rules:

- Status color goes only on dots, glyphs, pods, progress fills and flow packets. It never goes on text blocks, backgrounds or borders of whole cards.
- A card that needs attention gets an `--ink` border plus a status dot, not a colored border.
- Dimming: `color-mix(in oklch, var(--s-*) 40%, transparent)` for halos only.

### 2.3 Effects

| Token     | Light | Dark  | Use                                                                |
| --------- | ----- | ----- | ------------------------------------------------------------------ |
| `--gw`    | `0px` | `8px` | Glow radius for live status (`box-shadow: 0 0 var(--gw) <status>`) |
| `--dot-r` | `0`   | `0`   | Status dot radius (0 = square pixel)                               |

### 2.4 Full token sheets

```css
[data-theme="light"] {
  --bg: #f3f4f2;
  --panel: #fafaf8;
  --panel2: #edeeeb;
  --line: #d9dbd6;
  --line2: #bfc2bc;
  --ink: #111312;
  --ink2: #50544f;
  --ink3: #8a8e88;
  --grid: rgba(17, 19, 18, 0.05);
  --gw: 0px;
  --dot-r: 0;
  --s-work: oklch(0.6 0.14 160);
  --s-think: oklch(0.58 0.14 250);
  --s-block: oklch(0.7 0.15 70);
  --s-err: oklch(0.58 0.2 25);
  --s-done: oklch(0.56 0.15 300);
  --s-idle: #a9ada7;
}
[data-theme="dark"] {
  --bg: #0a0b0b;
  --panel: #101211;
  --panel2: #161917;
  --line: #232725;
  --line2: #343936;
  --ink: #ecefea;
  --ink2: #a2a8a2;
  --ink3: #666c67;
  --grid: rgba(236, 239, 234, 0.035);
  --gw: 8px;
  --dot-r: 0;
  --s-work: oklch(0.82 0.17 160);
  --s-think: oklch(0.78 0.13 245);
  --s-block: oklch(0.84 0.15 80);
  --s-err: oklch(0.7 0.2 25);
  --s-done: oklch(0.78 0.14 300);
  --s-idle: #4a504b;
}
```

Contrast: `--ink` on `--bg`/`--panel` is above 15:1 in both themes. `--ink2` passes AA for body text. `--ink3` is for ≥10px mono labels and non-essential metadata only; never use it for primary content.

---

## 3. Typography

```html
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap"
/>
```

| Token         | Stack                                   |
| ------------- | --------------------------------------- |
| `--font-sans` | `'Geist', system-ui, sans-serif`        |
| `--font-mono` | `'Geist Mono', ui-monospace, monospace` |

Weights: 400 (body), 500 (titles, names), 600 (mono emphasis, wordmark). Never use 700 or above.

### 3.1 Sans scale (content)

| Token     | Size / line-height | Weight  | Tracking | Use                                                |
| --------- | ------------------ | ------- | -------- | -------------------------------------------------- |
| `display` | 32 / 1.1           | 500     | -0.02em  | Page title                                         |
| `h1`      | 30 / 1.1           | 500     | -0.02em  | Profile name, hero entity                          |
| `h2`      | 24 / 1.2           | 500     | -0.01em  | Section title                                      |
| `h3`      | 18 / 1.3           | 500     | 0        | Panel title (department name)                      |
| `title`   | 16 / 1.35          | 500     | 0        | Card title, node name                              |
| `body-lg` | 15 / 1.35          | 400     | 0        | Current task, emphasized paragraph                 |
| `body`    | 14 / 1.45          | 400     | 0        | Default paragraph                                  |
| `body-sm` | 13 / 1.35          | 400–500 | 0        | Card body, list rows                               |
| `caption` | 12 / 1.4           | 400     | 0        | Role, description, meta                            |
| `metric`  | 20 / 1.1           | 500     | 0        | Stat values (`font-variant-numeric: tabular-nums`) |

### 3.2 Mono scale (system voice), always UPPERCASE

| Token      | Size  | Weight  | Tracking | Use                                                        |
| ---------- | ----- | ------- | -------- | ---------------------------------------------------------- |
| `wordmark` | 13    | 600     | 0.18em   | ZIBBYCORP logotype                                         |
| `label`    | 11    | 400–600 | 0.14em   | Section labels, nav tabs, header meta                      |
| `label-sm` | 10    | 400     | 0.12em   | Card meta, IDs, button text, legend                        |
| `code`     | 11–12 | 400     | 0.10em   | Agent names, IDs, log lines (log lines are not uppercased) |

Patterns:

- Section label: `03 — DEPARTMENT` (number, em dash, noun) in `label` with `--ink3`.
- Separators: `·` (middle dot, spaced) between inline meta: `ENG-02 · DEVELOPMENT`.
- Numbers are zero-padded to 2 digits in mono contexts: `03`, `07 AG`.
- Use `text-wrap: pretty` on paragraphs.

---

## 4. Spacing

Base unit **2px**, primary rhythm **4 / 8**. These are the values actually used; stick to them.

| Token      | px  | Typical use                                       |
| ---------- | --- | ------------------------------------------------- |
| `space-1`  | 2   | Hairline offsets                                  |
| `space-2`  | 4   | Label ↔ value in a stack                          |
| `space-3`  | 6   | Chip gap, button group gap                        |
| `space-4`  | 8   | Icon ↔ text, small stacks, grid gap between nodes |
| `space-5`  | 10  | Card padding (compact), list gap                  |
| `space-6`  | 12  | Card padding (default), rail inner padding        |
| `space-7`  | 14  | Panel padding, table cell x-padding               |
| `space-8`  | 16  | Rail section gap, card padding (roomy)            |
| `space-9`  | 18  | Panel header x-padding, section header gap        |
| `space-10` | 20  | Rail padding                                      |
| `space-11` | 24  | Page gutter, header x-padding, grid cell          |
| `space-12` | 32  | Main content padding                              |
| `space-13` | 36  | Header group gap                                  |
| `space-14` | 56  | Page section gap (documents)                      |

Density: the product is dense by default, with 8–12px padding inside cards. Documents and settings pages use 16–24px.

---

## 5. Layout

| Token        | Value           | Notes                                            |
| ------------ | --------------- | ------------------------------------------------ |
| `header-h`   | 56px            | Top bar, `--panel` with a bottom `--line`        |
| `rail-left`  | 280px           | NEEDS YOU / approvals rail                       |
| `rail-right` | 400px           | Inspector / agent profile                        |
| `main`       | `minmax(0,1fr)` | Padding 26px 32px                                |
| `app-min`    | 1440 × 900      | Desktop app minimum                              |
| `doc-max`    | 1320px          | Max width for document pages, with a 24px gutter |
| `grid-bg`    | 24px            | Background grid cell                             |
| `grid-bg-sm` | 8 / 12px        | Grid inside avatar tiles and hero glyph panels   |

Background grid (on `--bg` surfaces):

```css
background-color: var(--bg);
background-image:
  linear-gradient(var(--grid) 1px, transparent 1px),
  linear-gradient(90deg, var(--grid) 1px, transparent 1px);
background-size: 24px 24px;
```

App shell: `grid-template-rows: 56px minmax(0,1fr)`, and the body is `grid-template-columns: 280px minmax(0,1fr) 400px`.

Grids of cards: use `repeat(auto-fill, minmax(200–280px, 1fr))` with `gap: 8–10px`. For hairline-divided cells, give each cell `box-shadow: 0 0 0 1px var(--line)` and set the grid to `gap: 1px`. Don't paint the gap with a background color: empty cells in the last row would fill with it.

---

## 6. Shape, borders, elevation

| Token                     | Value                                                        |
| ------------------------- | ------------------------------------------------------------ |
| `radius`                  | **0** everywhere                                             |
| `radius-round`            | 50% (status pod and flow packet only)                        |
| `border`                  | `1px solid var(--line)` (default)                            |
| `border-strong`           | `1px solid var(--line2)` (controls, inputs, inset cards)     |
| `border-focus` / selected | `1px solid var(--ink)`                                       |
| `border-draft`            | `1px dashed var(--line2)` (placeholders, out-of-nav, drafts) |

Elevation is expressed by surface step, not shadow: `--bg` (lowest, inset) → `--panel` (raised) → `--panel2` (selected). A modal or sheet is a `--panel` surface with an `--ink` border, over a scrim of `color-mix(in oklch, var(--bg) 70%, transparent)`.

**Corner brackets.** These are the signature framing device for focus objects (CEO/COO node, hero glyph, active panel): four 8–10px L-shaped marks at the corners in `--ink`.

```html
<div
  style="position:absolute;top:-1px;left:-1px;width:8px;height:8px;border-top:1px solid var(--ink);border-left:1px solid var(--ink)"
></div>
<!-- repeat for the other three corners -->
```

---

## 7. Iconography & glyphs

- **Agent glyph**: a procedural 12×12 pixel sprite seeded from the agent name. It uses `shape-rendering: crispEdges` and is tinted by state. Each state has its own motion (typing keys, thinking dots, blocked pulse, error sparks, done twinkle). Sizes: 18 (inline), 22 (logo), 30 (list), 48 (card), 128 (hero).
- **Status dot**: a square 7–9px, filled with the status color. Working dots breathe (`zb-live`), blocked dots blink (`zb-pulse`), others are static.
- **Status pod**: a circle with a 1.5px inset ring in the status color and the glyph at 58% size. Working and blocked pods emit an expanding ring (`zb-ring`).
- **Cell strip**: a row of 9px dots, one per agent, used as a department's micro-summary.
- **Text icons**: `→` (go/open), `⇄` (rework loop), `⌘K`, `·`. There is no icon font; use a thin 1.5px-stroke line icon set only if needed.
- No emoji. No illustrative SVG.

---

## 8. Components

All components use `radius 0`, mono UPPERCASE text for controls, and 1px borders.

### Buttons

| Variant      | Style                                                                            |
| ------------ | -------------------------------------------------------------------------------- |
| Primary      | bg `--ink`, text `--panel`, mono 10–11 / 0.12–0.14em, padding 7–12px             |
| Secondary    | transparent bg, `1px --line2`, text `--ink2` → hover text `--ink`, bg `--panel2` |
| Icon / arrow | Secondary with padding 6×9, content `→`                                          |
| Destructive  | Secondary with a `--s-err` dot before the label (never red fill)                 |

Sizes: sm = 6px padding / 10px text, md = 11px / 11px. Mobile hit targets ≥ 44px.

### Segmented control

`1px --line2` container. Items are mono 10 / 0.14em, padding 6×10. The selected item is bg `--ink` / text `--panel`, unselected is `--ink3`. Used for LIGHT/DARK and view toggles.

### Tabs (top nav)

Mono 11 / 0.14em, full header height, padding 0 14px. Active tab: text `--ink` with a 1px `--ink` bottom border. Inactive: `--ink3`.

### Chip / tag

Mono 11, padding 4×8, `1px --line2`, text `--ink2`. Chips in a row use a gap of 6.

### Search trigger

Bordered `--line2`, padding 6×10, `SEARCH AGENTS` with `⌘K` in `--ink3`, gap 14.

### Card

Bg `--panel` (on `--bg`) or `--bg` (inside a panel). Border `1px --line`, padding 10–12, gap 8. Selected: border `--ink`. Header row is mono 10 meta in `--ink3`, with `justify-content: space-between` and a gap of at least 8.

### Approval card (NEEDS YOU)

The card sits on `--bg` with a `--line2` border and 12px padding. It contains, top to bottom:

1. A row with the glyph (30), the name (mono 11 / 600), `ID · DEPT` (mono 10, `--ink3`) and the wait time on the right.
2. The request text (sans 13).
3. Action buttons in a row with a gap of 6: `APPROVE` (primary, flex 1), `DENY` (secondary, flex 1) and `→` (icon).

### Org node (department)

Card with padding 10. From top to bottom:

1. A row with the code and the agent count (mono 10).
2. The name (sans 13 / 500).
3. The cell strip.
4. Beneath a top divider, the alert line (dot + mono 10).

Nodes are joined with 1px `--line2` connectors, which turn `--ink` when selected.

### Panel

Bg `--panel`, border `1px --ink` when it is the focus region, otherwise `--line`. Header padding is 13×18 with a bottom `--line` and contains the section label, the title (h3) and meta on the right.

### Inspector (right rail)

Contents, top to bottom:

1. The section label.
2. A hero glyph tile: 188px tall, with corner brackets and a 12px grid.
3. The name (h1) with a state badge. The badge is `1px --line2`, padding 5×10, dot + mono 11.
4. A "current task" card.
5. Meta rows.
6. Chips.
7. A metric strip: 3 columns between top and bottom `--line` hairlines.
8. The log.
9. The action bar: secondary (flex 1) + primary (flex 2).

### Progress

2px track `--line`, fill `--ink` (or the status color for a live state). Beneath it, a meta row in mono 10: step · elapsed · %.

### Log line

Mono 11 / 1.4. Timestamp in `--ink3`, text in `--ink2`. The newest line is in `--ink` with a blinking block caret (6×12, `zb-caret`).

### Legend

2-column grid, gap 10×16. Each row is dot + mono 10 label (flex 1) + count in `--ink3`.

### Table / list

Rows are separated by 1px `--line`, padding 9–11 × 14. The header row is mono 10 / 0.14em in `--ink3`. Columns use `minmax(0, …fr)`.

### Flow / handoff

The step grid uses hairline cells (see Layout), and each cell is labeled `01 · WHERE`. Handoff arrows are mono `→` in `--ink3`, with an optional `GATE` label below. Live transfer is shown by a 4px round packet in `--s-work` travelling along a connector (`zb-flow`).

### Inputs

Height 32–36, bg `--bg`, border `1px --line2`, sans 13 text, placeholder in `--ink3`. Focus: border `--ink`, no ring. Label: mono 10 / 0.14em in `--ink3`, above the field with a gap of 6.

---

## 9. Motion

| Token      | Value               | Use                        |
| ---------- | ------------------- | -------------------------- |
| `dur-fast` | 120–160ms           | Hover, press               |
| `dur-base` | 200ms               | Theme switch, selection    |
| `dur-slow` | 400ms               | Progress width             |
| `ease`     | `ease` / `ease-out` | UI                         |
| `steps`    | `steps(1,end)`      | Glyph and pixel animations |

Keyframes:

```css
@keyframes zb-live {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
} /* working dot, 1.4s ease-in-out */
@keyframes zb-pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.1;
  }
} /* blocked, 1s steps */
@keyframes zb-ring {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  100% {
    transform: scale(1.28);
    opacity: 0;
  }
} /* pod */
@keyframes zb-flow {
  0% {
    transform: translateY(-3px);
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  85% {
    opacity: 1;
  }
  100% {
    transform: translateY(var(--len, 20px));
    opacity: 0;
  }
}
@keyframes zb-caret {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}
@keyframes zb-twinkle {
  0%,
  100% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
}
@keyframes zb-dot {
  0%,
  100% {
    opacity: 0.12;
  }
  40% {
    opacity: 1;
  }
}
```

Respect `prefers-reduced-motion`: stop all loops and keep the static state color.

---

## 10. Voice & copy

- Language: English.
- System voice (mono) is terse and uppercase: `NEEDS YOU`, `03 BLOCKED`, `OPEN SESSION →`.
- Content voice (sans) is plain sentence case, specific and short: "Approve push to `main` for PR #318".
- IDs follow `DEPT-NN` (`DEV-02`) and `TSK-NNNN`.
- Departments use corporate names only (Development, Monitoring & Ops, Security, Release Management, Incident Response, R&D, Communications, QA & Architecture, Knowledge Management, Finance, Personal Office). Their codes are DEV, OPS, SEC, REL, INC, RND, COM, QA, KNW, FIN, PER.
- No emoji. No exclamation marks.

---

## 11. Do / Don't

- **Do** use the `--ink` border to indicate selection or focus.
- **Do** keep hue for state; everything else stays grayscale.
- **Do** zero-pad counts and use tabular numbers.
- **Don't** round corners, add drop shadows or use gradients (except the background grid).
- **Don't** color text with status hues; pair a dot with neutral text instead.
- **Don't** use `--ink3` for anything the user must read to act.
