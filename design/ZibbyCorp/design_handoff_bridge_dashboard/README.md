# Handoff: ZibbyCorp Bridge Dashboard v2

## Overview
"Bridge" is the operator's single-screen cockpit for ZibbyCorp: a configurable board of widgets (Briefing, Issues, Pull Requests, Tasks, Running Now, Incidents, Errors, Alerts). Clicking any row opens a detail sheet anchored next to the row. The user can edit the layout (drag/resize/add/remove widgets), save layouts, and switch density.

## About the Design Files
Everything in `reference/` is a **design reference built in HTML** — a working prototype of the intended look and behavior, **not production code**. Recreate it in the target codebase's existing stack (React/Vue/etc., its component and styling conventions). If there is no stack yet, pick the most suitable one. Do not ship the `.dc.html` file or `support.js`.

`reference/Bridge Dashboard v2.dc.html` is the single source of truth. All values below are lifted from it. **When this README and the file disagree, the file wins.**

## Fidelity
**High-fidelity.** Colors, type, spacing, borders, and interactions are final. Match them pixel for pixel. Do not "modernize": no rounded corners (everything is square, `border-radius: 0`), no shadows (except density "Open"), no gradients, no emoji, no icon library (glyphs are text: `▾ ▸ × ↗ →`).

## How to get an exact result (process for Claude Code)
1. Open `reference/Bridge Dashboard v2.dc.html` in a browser at **1440×900** and **1920×1080**. Use it as the visual spec. Take reference screenshots with Playwright.
2. Build the app, screenshot it at the same viewports and states, and diff against the reference. Iterate until the differences are gone. Don't declare done on "looks similar".
3. States to compare: default board; each density; edit mode (grid guides, size labels, resize handle); catalog open; each sheet type (issue, task, PR, approval); a selected row (ring + sheet flush to row); collapsed and empty widgets; each layout preset.
4. Port the CSS values literally (the file is all inline styles). Don't substitute Tailwind scale steps or design-system defaults where a value differs.
5. Port the logic as written (`compact()`, `measure()`, `TS()`, `mergeReady()`, `rowBase()`). It is small and deterministic. Data comes from `zc-data.js` / `zc-inbox.js` (`window.ZC`, `window.ZI`) — replace with real API data of the same shape.

## Screen: Bridge (only screen)
Root: `100vw × 100vh`, `min-width:1440px; min-height:900px`, `overflow:hidden`. Grid rows: `48px` header, then the board (`minmax(0,1fr)`).
Background: `--bg` with a 24×24px grid of 1px lines, `--grid`.

### Header (48px)
Flex, gap 20, padding `0 16px`, bottom border `1px --line`, bg `--panel`. All text Geist Mono 10px, letter-spacing .12em, nowrap.
- Left: logo SVG 24×24 (polygon crest, ink fill, panel-colored glyph — copy the SVG from the file), `ZIBBYCORP` 13px / .18em / 600, `/ BRIDGE` in `--ink3`.
- Spacer, then **LAYOUT** segmented control (`1px --line2` border): DEFAULT · REVIEW · INCIDENT · saved layouts · CUSTOM (only when edited). Button padding `6px 10px`; active = bg `--ink`, text `--panel`; inactive text `--ink3`.
- **Density** button (4-line glyph + ▾), padding `5px 8px`, border `1px --line2`. Dropdown: 150px wide, `1px --ink` border, bg `--panel`, items padding `9px 12px`, active bg `--panel2`. Options COMPACT / COMFORT / AIRY / OPEN, glyph line y-positions: Compact [3,6,9,12], Comfort [2,5.5,9,12.5], Airy [1.5,5,10,13.5], Open [1,4.5,10.5,14] (16×16 viewBox, stroke 1.4).
- Edit-mode only: `+ WIDGET`, `SAVE AS`, `RESET` (padding `6px 10px`, border `1px --line2`, text `--ink2`, hover bg `--panel2` text `--ink`).
- `EDIT LAYOUT` / `DONE` (border `1px --ink`, padding `6px 12px`; DONE = filled ink).
- Clock `THU 24 SEP · 14:32`, `--ink2`, tabular-nums.

### Board / grid system
- 12 columns. Column width `cw = (boardInnerWidth − gap·11) / 12`. Row height `rh` and `gap` depend on density (table below).
- Widget absolute position: `left = x·(cw+gap)`, `top = y·(rh+gap)`, `width = w·cw + (w−1)·gap`, `height = h·rh + (h−1)·gap`. Position/size animates `.15s ease` (none while dragging).
- Board padding = density `bp`. Board scrolls (`overflow:auto`).
- Vertical gravity: after every change widgets are compacted upward (`compact()` in file). In view mode, empty or collapsed widgets shrink to `h=1` and neighbours move up; in edit mode all keep their real size.
- Default layout `[type, x, y, w, h]`: briefing 0,0,12,3 · issues 0,3,4,18 · prs 4,3,4,18 · tasks 8,3,4,7 · runs 8,10,4,5 · incidents 8,15,4,2 · errors 8,17,4,3 · alerts 8,20,4,2.
  REVIEW: prs 0,0,6,21 · issues 6,0,3,21 · tasks 9,0,3,11 · runs 9,11,3,10.
  INCIDENT: incidents 0,0,4,6 · errors 0,6,4,6 · alerts 0,12,4,3 · runs 4,0,4,21 · tasks 8,0,4,21.

### Density table (default **Airy**)
| | Compact | Comfort | Airy | Open |
|---|---|---|---|---|
| gap | 8 | 12 | 14 | 16 |
| row unit rh | 30 | 32 | 34 | 34 |
| board pad | 12 | 20 | 32 | 36 |
| row pad | 8/12 | 12/16 | 16/20 | 15/20 |
| PR row pad | 10/12 | 14/16 | 18/20 | 17/20 |
| row border | 1px --line | 1px line 55% | 1px line 35% | none |
| status bar (border-left) | 4 | 3 | 2 | 3 |
| inner gap | 5 | 7 | 9 | 8 |
| widget header h / x-pad | 28 / 12 | 38 / 16 | 46 / 20 | 48 / 20 |
| epic header pad | 8/12 | 12/16 | 16/20 | 14/20 |
| briefing pad | 10/14 | 16/20 | 22/26 | 24/28 |
| KPI font / pad-x | 20 / 16 | 22 / 22 | 28 / 28 | 28 / 28 |
| widget shadow | none | none | none | `0 1px 2px rgba(17,19,18,.05), 0 8px 24px -12px rgba(17,19,18,.12)` |
| widget border | --line | --line | line 60% | transparent |
(Row border = `1px solid color-mix(in oklch, var(--line) 55%, transparent)` etc.)

### Widget chrome
Widget: bg `--panel`, `1px` border, `box-sizing:border-box`, flex column. Header (height per density): Geist Mono 10px / .14em; label `--ink` 500; count `--ink2` tabular; `N YOU` badge = `1px --ink` border, padding `1px 5px`; right-aligned aside (`ALL CLEAR`) `--ink3`; collapse caret `▾/▸` and (edit) `×`, `--ink3` → `--ink` on hover. Body scrolls vertically. Empty widgets collapse to header only outside edit mode (edit mode shows dashed "Nothing here…" box). Edit mode adds: border `--line2` (dragging: `--ink`), `move` cursor on header, size label `W × H` bottom-left (Mono 10px `--ink3`), resize handle 12×12 bottom-right (`2px --ink` right + bottom borders), grid column guides behind the board (`color-mix(in oklch, var(--ink) 5%, transparent)`).

### Widget contents
All rows: `cursor:pointer`, left status bar in state color, hover bg `--panel2`. Selected row: bg `--panel`, z-index above overlay, inset 1px ink top/bottom (and right when sheet opens left). Rows needing the user get `inset 0 0 0 1px --ink` and a `YOU · <wait>` tag.
- **Issues**: epic group header (button, grid `10px auto 1fr 56px auto`, bg `--bg`: caret, key, title 13/500, 2px progress bar ink on `--line`, `done/total`) then issue rows: line 1 grid `62px 1fr auto` (id Mono 10 `--ink2`, title 13/500 ellipsis, YOU tag); line 2 Mono 10 .08em, padding-left 70: source chip (`1px --line2`), Zibby state, `· PROJECT`, optional `· #PR` underlined, right-aligned age. Sorted waiting → new → running → done. Done hidden unless `showDoneIssues`.
- **Tasks**: grid `66px 1fr auto auto`; id, title 13, pipeline chips (Mono 9px, padding `2px 4px 1px`, bg `--bg`, 2px bottom border in dept state color, text `--ink3` when idle), age/YOU tag.
- **Pull requests**: grouped by stack; root card then children indented `margin-left:20` with `1px --line2` left rule. Card: `#n` Mono 11 + title 13/500 line-height 1.35; meta line `REPO · AUTHOR · AGE · TASK`; status line Mono 10 `STATE` 600 + `ON #base` + `WAITS ON #…`. Groups sorted by most urgent member.
- **Running now**: column header (`TASK · STEP`, `PROGRESS`, `ISSUE`, Mono 10 `--ink3`), grid `1fr 120px 64px`; 2px progress bar in state color (working = `zb-soft` pulse 2.8s), percent, issue link underlined when linkable.
- **Incidents / Errors / Alerts**: grid `1fr auto auto` title · source (Mono 10, `--ink3`, max 180px) · duration.
- **Briefing**: lead paragraph (14/1.45, `--ink2`, with Mono 10 date above) + KPI strip: each KPI has `1px --line` left border, 7×7 square dot, label Mono 10 `--ink3`, value 500 tabular. KPIs: NEEDS YOU, RUNNING NOW, OPEN PRS, ERRORS, INCIDENTS, SPEND TODAY.

### Detail sheet
Opens on row click. Overlay: absolute inset 0, `color-mix(in oklch, var(--bg) 74%, transparent)`. Sheet is positioned by measuring the row: if ≥460px free to the right of the row it opens to the right (left edge = row's right edge), otherwise to the left (right edge = row's left edge). Vertical extent = full board area (top of board to bottom of viewport). Border `1px --ink`, top border `4px` in state color. A 3px `--panel` "eraser" strip on the shared edge makes the selected row visually flow into the sheet (`eL/eT/eH` in `measure()`). Re-measure on every update/resize.
- Header: padding `14px 20px`, Mono 10 kind · id, state label 600, hint `J / K · ESC`, close ×. Title 22/1.2/500, letter-spacing −.01em. Chips: padding `4px 8px`, `1px --line2`.
- "Needs you" card: `1px --ink` border + `4px --s-block` left, bg `--bg`, padding 12; diff block Mono 11/1.5; textarea (`1px --line2`, focus `--ink`, no radius) + `SEND ANSWER`; or `APPROVE` (flex 2, filled) / `DENY` (flex 1, outlined).
- Section labels: Mono 11 / .14em / `--ink3`. Body copy 14/1.45.
- Issue: description, details table (`110px 1fr`, 1px top rules). Footer: `OPEN IN <SRC> ↗` + `PROCESS INTO A TASK` (primary, filled ink).
- Task: chain cards (auto-fit min 150, 3px bottom border in state color), subtasks table, agents table, artifacts chips.
- PR: 3 stat cells (REVIEW / CHECKS / CHANGES, 3px bottom color), optional STACK breadcrumb, two-column description+review / checks+files+diff (auto-fit min 300). Footer: `OPEN ON GITHUB ↗`, REQUEST CHANGES, APPROVE (only for others' PRs), then **MERGE** (in app) or **MERGE ON GITHUB ↗** per the `mergeInApp` setting. MERGE is 35% opacity + `not-allowed` unless `mergeReady()`.
- Keyboard: `J`/`↓` next row, `K`/`↑` previous (within the same widget), `Esc` closes sheet → catalog → edit mode.

## Interactions & behavior
- Drag header to move, handle to resize (snapped to grid; min width 2, min height 2; clamped to 12 cols). The dragged widget has priority; others compact around it. Any manual change flips the preset to `CUSTOM`.
- `SAVE AS` stores `MY LAYOUT NN`; `RESET` restores DEFAULT.
- Persist in localStorage `zc-bridge-v2`: density, layout, preset, saved layouts, collapsed widgets, closed epics (replace with per-user server settings).
- `prefers-reduced-motion`: disable all animation.
- Props: `showDoneIssues` (default false), `mergeInApp` (default true).

## State
`density, densityOpen, editing, sel{kind,id,wid,key}, anchor, layout[{id,type,x,y,w,h}], preset, saved, collapsed, epicClosed, catalog, dismissed, answer, bw (board width, via ResizeObserver), dragging`.
Derived status colors: working=`--s-work`, thinking=`--s-think`, blocked=`--s-block`, error=`--s-err`, done=`--s-done`, idle=`--s-idle`.
PR status precedence (`TS()`): merged → review requested → draft → CI failing → changes requested → checks running → approved → awaiting review.
Merge-ready: approved, all checks passed, not running, none failing, no pending approval record, every PR below in the stack merged.

## Design tokens
Colors: `--bg #F3F4F2` · `--panel #FAFAF8` · `--panel2 #EDEEEB` · `--line #D9DBD6` · `--line2 #BFC2BC` · `--ink #111312` · `--ink2 #50544F` · `--ink3 #8A8E88` · `--grid rgba(17,19,18,.05)` · `--s-work oklch(0.6 0.14 160)` · `--s-think oklch(0.58 0.14 250)` · `--s-block oklch(0.7 0.15 70)` · `--s-err oklch(0.58 0.2 25)` · `--s-done oklch(0.56 0.15 300)` · `--s-idle #A9ADA7`. Links: `#111312`, hover `#50544F`. Placeholder `#8A8E88`.
Fonts: **Geist** (400/500/600) for prose and titles; **Geist Mono** (400/500/600) for all labels, ids, metadata, buttons (uppercase, letter-spacing .06–.18em, 9–11px). Body title size 13px; paragraph 14px; sheet title 22px. Use `font-variant-numeric: tabular-nums` on all numbers. `text-wrap: pretty` on multi-line text.
Radius: 0 everywhere. Borders: 1px solid, hairline aesthetic. Min-width 1440.
See `reference/ZibbyCorp Design System.md` for the wider system.

## Assets
No images. Logo is an inline SVG (in the file's header). Glyphs are text characters.

## Files
- `reference/Bridge Dashboard v2.dc.html` — the design (markup + logic).
- `reference/zc-data.js`, `reference/zc-inbox.js` — mock data/shape of `window.ZC` and `window.ZI`.
- `reference/support.js` — prototype runtime only; do not port.
- `reference/ZibbyCorp Design System.md`.
