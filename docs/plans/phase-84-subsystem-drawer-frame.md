# Phase 84 — Subsystem detail drawer: frame, header, tab shell

> Design doc: subsystem detail opens as an **inline panel over the chat (a drawer), never a
> page navigation** — staying in the conversation's flow is the point. Right side of the chat
> screen. This phase builds the drawer chrome + header + empty tab shell; tabs get content in
> phases 85–88.

## Provisional decisions (flagged, not silently resolved)

The design doc leaves two drawer questions OPEN (mobile behavior; multiple drawers at once).
v1 ships the conservative floor and records both as open:

- **One drawer at a time** — selecting another node swaps the drawer content. Multi-drawer
  stays an open operator decision; nothing in this structure precludes it later.
- **Desktop-first**: below `lg` the drawer overlays the full chat width (sheet-style) instead
  of docking right. Explicitly provisional; note it in code comment + this file.

## 1 — Drawer component

`apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx` (+ test):

- Docked right inside `ChatScreen` (compose DS `Panel`/`Container` — check DS for an existing
  drawer/sheet primitive first; if none exists, this is a domain composite, NOT a new DS
  primitive — record the decision per the "never leave it implicit" rule).
- Opens when `selectedSubsystemId` (phase 83 state) is set; Close affordance top-right (the
  one-interaction-grammar spot); `Escape` closes; focus moves into the drawer on open and
  returns to the node on close (follow the Dialog a11y idiom from the phase-19 audit work).
- **Opening marks Tier-2 seen**: fire phase-82's `markSubsystemSeen` mutation
  (`useMarkSubsystemSeenMutation`, invalidates the subsystems query key) — this is the "report
  is dismissed by being seen" acknowledgment. Tier 3 items are untouched by opening.
- It's an overlay panel, not a route: no URL change, chat stays interactive to its left.

## 2 — Header

Per design: hero portrait area (subsystem `color` as the tint; `heroImage` when phase 90 lands
— until then a color-graded placeholder band using the DS `EntityHero`/`IconTile` idiom from
run-detail), then name, tagline, one-line mandate, live status indicator (`StatusDot` mapped
from `state`: klid=muted, bezi=info/own-color, hlaseni=ok+count, ceka=warn/urgent+count).

## 3 — Tab shell

Four tabs, exact v1 set from the design doc: **Roster · Aktivita · Nastavení & Gates ·
Artefakty**. Reuse the tab mechanism the project detail page uses (`ProfileScreen.tsx` tabs
`overview|profile|secrets|integrations`) — same component/idiom, do not invent a new tab UI.
Each tab body this phase: a minimal placeholder that names its phase ("Roster — fáze 85" etc.)
via a shared empty-state composite, so the drawer is honest about scope until 85–88 land.

Tab state is local to the drawer; default tab Roster.

## Tests

- Opens on selection, closes on Escape/Close, focus management asserted.
- Header renders name/tagline/mandate/status from fixture for each of the 4 states.
- `markSubsystemSeen` fired exactly once per open (not per re-render).
- Tabs switch; all four present with testids (`SubsystemDrawerTestId` enum).

## Verification (paste real output)

- `npx tsc -p` web — clean; `npx eslint <touched>` — clean.
- `npx vitest run apps/web/features/subsystems apps/web/features/chat` — green.
- Visual: screenshot of `/chat` with drawer open over the scene.

## Constraints

- i18n cs + en for all drawer strings.
- No page navigation, no dialog-for-detail (dialogs are for creating/confirming only — the
  drawer is a panel).
- Keep `ChatScreen` layout intact: transcript column must not jump when the drawer opens on
  `lg+` (drawer takes the right rail space, transcript stays centered or shifts gracefully —
  match how `ChatTasksPanel` occupies the left).
