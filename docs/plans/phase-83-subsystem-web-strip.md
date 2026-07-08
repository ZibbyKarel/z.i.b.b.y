# Phase 83 — The subsystem web: fixed constellation strip in Chat UI

> Design doc "The web, not an orbit": fixed node positions in a flattened ellipse, ZIBBY orb at
> ~2× node diameter in the center, thin static spokes (node↔core) + a faint rim (neighbor↔
> neighbor). Nodes NEVER move. Sits as the center-top strip of the chat screen, above the
> transcript. Chat UI remains the frame (`ChatScreen.tsx`).

## Architect decision: DOM/SVG, not a three.js layer

The existing `CosmicScene` (three.js canvas) stays untouched as ambience. The web strip is a
NEW SVG component: the design's whole argument against orbiting was clickability — SVG gives
reliable hit-targets, keyboard focus, `data-testid` selectors (project testing convention),
and jsdom-testable state rendering. Do not extend `sceneController.ts` for this.

## 1 — Component

`apps/web/features/subsystems/components/SubsystemWeb/SubsystemWeb.tsx` (+ test):

- Props: `subsystems: SubsystemWithStatus[]`, `selectedId?: SubsystemId | null`,
  `onSelect(id: SubsystemId): void`.
- Geometry: pure helper `subsystem-web-geometry.ts` (unit-testable, same spirit as
  `pipeline-graph.ts`): 8 fixed slots on a flattened ellipse (ry ≈ 0.35 × rx so the strip stays
  short), orb at center with diameter ≈ 2× a node's. Deterministic from registry order — no
  randomness, no motion of positions.
- Lines: spokes center→each node; rim connecting ellipse-neighbors. Thin, faint (`stroke` from
  the subsystem/neutral tokens, low opacity). Static.
- Node rendering per state (design table):
  - `klid` — dim fill, no motion.
  - `bezi` — subtle pulse in the subsystem's own `color` (SMIL `<animate>` on opacity/r, or a
    CSS class already available via DS tokens — match repo idiom; honor `prefers-reduced-motion`).
  - `hlaseni` — calm color + small count badge (tier2Count).
  - `ceka` — strong pulsing ring, urgent tone (reuse the warn/danger token family), tier3Count
    badge. Must be visually louder than `bezi` at a glance.
- Interaction: whole node is a focusable button (`role`/keyboard per a11y conventions), click →
  `onSelect(id)`; selected node gets a selection ring. The orb itself is not a button in v1.
- `SubsystemWebTestId`-style testid enum for: root, orb, node (per id), badge, spoke group.
- No inline `style={{}}` on DOM elements; SVG geometry attributes (`cx`, `cy`, `r`, `d`) are
  attributes, not styles — fine. Genuinely dynamic CSS (none expected) would need the DS
  passthrough rule.

## 2 — Placement in `ChatScreen`

Insert the strip between the top bar and the transcript column (center-top, above the chat
thread). It must not steal the transcript's scroll — fixed height band (~180–220px), the
transcript's existing top fade mask sits below it. `CosmicScene` stays full-bleed behind
everything; verify the strip reads legibly over the nebula (a subtle backdrop or the scene's
existing masking — match how the top bar solves this today).

Wire `useSubsystemsQuery` (phase 80) for data. Local state `selectedSubsystemId` lives in
`ChatScreen` (the phase-84 drawer consumes it); this phase, clicking a node just sets state
(selection ring visible) — no drawer yet.

## Tests

- Geometry helper: 8 slots deterministic, ellipse flattening, orb radius = 2× node radius.
- Component: renders 8 nodes from registry fixture; state classes/badges per state fixture
  (one of each); click + Enter fire `onSelect`; badge hidden at count 0; testids present.
- ChatScreen: strip renders with the query mocked (follow existing ChatScreen test setup —
  `renderWithProviders` idiom from the web-components test project).

## Verification (paste real output)

- `npx tsc -p` web — clean; `npx eslint <touched>` — clean.
- `npx vitest run apps/web/features/subsystems apps/web/features/chat` — green modulo
  documented pre-existing reds.
- Visual: run `pnpm web:dev`, screenshot `/chat` showing the strip (attach to review).

## Constraints

- i18n: any visible strings (state labels/aria) via `useTranslations`, cs + en synced.
- Nodes never move; particles come in phase 89 — leave a clearly-named layer/group hook
  (`<g data-testid=…particles>`) but implement nothing animated along paths yet.
- Don't regress the phase-57/58 chat panels (`ChatTasksPanel`, palette, detail dialog).
