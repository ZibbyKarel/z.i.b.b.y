# Velín-D orb dashboard — design spec

> Replace the `/chat` "Cosmic" WebGL scene with the **Velín-D** orb-map visual
> language, keeping the existing chat surface below it, and retire the
> `/settings?tab=chatUi` page. Design imported from Claude Design project
> `ZIBBY Velin-D.html` (source jsx: `zibby/velin-d*.jsx`, `zibby/zt.jsx`).

- **Date:** 2026-07-13
- **Branch (proposed):** `feat/velin-d-orb-dashboard`
- **Route touched:** `/chat` (the immersive HUD). `/overview` is untouched.
- **Delivery model:** planner (me) + sonnet implementation subagents, parallel
  where the architecture allows; I review every diff.

---

## 1. Goal

Evolve the existing `/chat` three.js scene into the Velín-D "living map": a
central **breathing wireframe orb** (ZIBBY) surrounded by **8 subsystem orbs on a
clear elliptical orbit**, joined by animated connectors, each subsystem ringed by
orbital task-particles (count = live runs), with comet **handoff flares** between
subsystems. The chat (transcript + composer) stays below the orbs, as now.

This is an **evolution of the existing scene**, not a greenfield build: `three`
(0.185.1) + `@react-three/fiber` are already dependencies, the 8 subsystems are
already real data (`useSubsystemsQuery`, `SUBSYSTEMS` in contracts), run-event
handoff particles already exist, and the scene already has battle-tested
lifecycle/a11y/projection plumbing worth preserving.

## 2. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Styling/architecture | **Isolated WebGL scene module + DS chrome.** Scene stays in `features/chat/scene/` under its existing file-level `eslint-disable react/forbid-dom-props` escape hatch (sanctioned — genuinely dynamic WebGL geometry). All non-scene chrome uses DS primitives + Tailwind + i18n. `ZT` prototype tokens map onto existing Theme/CSS-var tokens. |
| D2 | Data source | **Wire real data** — already wired (subsystems/runs/pipelines/mode). New surfaces (overview modal, status pill) read the same live queries. No mock data. |
| D3 | Center-orb click | Opens a new **`CoreOverviewDialog`** (port of Velín-D `VcCoreDetailD`) as a DS `Dialog`, wired to real overview/subsystem data. |
| D4 | Subsystem-orb click | **Keep the existing `SubsystemDrawer`** (Roster/Aktivita). No change. (This is NOT the excluded Velín-D `VcSubsystemDetail` dialog.) |
| D5 | Chat surface | **Keep** transcript + composer + ⌘K palette + voice, same layout position (below the orbs). |
| D6 | Left tasks panel | **Keep** the existing `ChatTasksPanel` + `ChatTaskDetailColumn`. |
| D7 | Scene implementation | **Retune the existing single-context `SceneController`/layers** — NOT port the prototype's per-orb `<canvas>` approach (which would spin ~9 WebGL contexts and discard the lifecycle/a11y/handoff plumbing). |
| D8 | Settings removal | Remove `/settings?tab=chatUi` (`ChatUiSection`) + its tab wiring + genuinely-dead `features/speech/` code. **Leave `powerSaver`/`ttsVoice` schema fields** — still read by the scene / voice-reply; only their settings UI goes. |
| D9 | Top bar | Keep current DS top bar; **add** the Velín-D center status pill ("Nominal · N pracují · N hlášení · N čekají"), derived from live subsystem states. |

## 3. Explicitly out of scope

- Velín-D's new **subsystem detail dialog** (`VcSubsystemDetail`) — excluded.
- Velín-D's new **floating tasks rail** (`VcTaskRail`) — excluded (keep existing panel, D6).
- Velín-D's new **chat dock** (`VcChatDock`) — excluded (keep existing chat, D5).
- Velín-D's **task-detail overlay** (`VcTaskDetail`) — excluded.
- A new subsystem detail **page/route** — not built (D4).
- `/overview`, the nav rail, and any non-`/chat` screen.
- Ripping out `powerSaver`/`ttsVoice` schema fields (D8).

## 4. Current state (what exists today)

- **Route:** `apps/web/app/(dashboard)/chat/page.tsx` → `features/chat/Screen.tsx`
  → `features/chat/components/ChatScreen.tsx` (748 lines — the HUD). `AppShell`
  bypasses `MainLayout` for `/chat` (bare 100dvh host).
- **Scene:** `features/chat/scene/` — `CosmicScene.tsx` (React shell, dynamic-imports
  the controller, mounts `SubsystemOrbsOverlay`), `sceneController.ts` (~50 KB),
  and layer builders `orbLayer.ts`, `backgroundLayer.ts`, `particleLayer.ts`,
  `ringsLayer.ts`, `dockLayer.ts`, `glsl.ts`, `tokens.ts`, `sceneTypes.ts`,
  `modeVisuals.ts`, `constellation.ts`, `clusterGeometry.ts`, `dock.ts`,
  `canMountWebGL.ts`. Test/story siblings exist for most.
- **Data already wired in `ChatScreen`:** `useSubsystemsQuery` (8 subsystems +
  live state/color), `useRunsQuery`, `usePipelinesQuery`, derived `SceneMode`,
  `onRunEvent` handoff particles via `flightForEvent`.
- **Settings:** `features/settings/Screen.tsx` tabs `"chat"` (persona — KEEP) and
  `"chatUi"` (REMOVE). `ChatUiSection.tsx` uses `useSpeechStatusQuery` /
  `useSpeechVoicesQuery` from `features/speech/`, and mutates `powerSaver`/`ttsVoice`.

## 5. Target design (Velín-D language)

Reference: `zibby/velin-d-orb.jsx` (shader), `zibby/velin-d-map.jsx` (layout/physics),
`zibby/zt.jsx` (tokens), `zibby/velin-d.jsx` (`VcCoreDetailD`).

1. **Central orb** — wireframe icosahedron, vertices displaced along normals by 3D
   simplex noise (`ORB_SIMPLEX`), fresnel edge alpha, additive back-side glow shell.
   Motion state map (`ORB_MOTION`: idle/thinking/working/report/await/incident →
   amp/speed/glow/breath) with exponential easing to target (~TAU 0.2s). Breathing
   scale ~±3%. Maps to the existing derived `SceneMode`.
2. **Subsystem orbs** — smaller wireframe orbs, **tinted by subsystem identity
   color** (`SUBSYSTEMS[].color`), placed on a **wide elliptical orbit** around the
   center (`radiusX`/`radiusY` from viewport, top-anchored so labels clear the chat
   band). Each carries: a **state halo** (color = state), **orbital task-particles**
   (3D orbit, count = active runs for that subsystem), an **attention pulse ring**
   for await/incident/report, an identity glyph, and a name+state label.
3. **Connectors** — quadratic-curve links center↔each subsystem; a faint static
   path plus an animated dashed pulse in the subsystem's state color when live.
4. **Handoff flares** — comet (core + 2 echo trails) travelling an arc between two
   subsystem positions, with a launch ring at source and a burst at target. Driven
   by the existing `onRunEvent`/`flightForEvent` mapping.
5. **Background** — muted to Velín-D's clean radial gradient
   (`radial-gradient(ellipse 130% 100% at 50% 42%, …)`); the heavy procedural
   nebula is dialed down or removed.
6. **Center status pill** (top bar) — "Nominal · N pracují · N hlášení · N čekají",
   counts derived from live subsystem states.

Token mapping: `ZT.bg/surface/line/ink*/accent/ok/run/wait/bad` → existing
Theme/CSS vars (`--color-*`) already used by `ChatScreen`/`scene/tokens.ts`. No new
global token object; extend `scene/tokens.ts` if a value is missing.

## 6. Workstreams & parallelization

Dependency graph: **A, D, E are independent** and run in parallel immediately.
**B (scene) and C (interaction) are one coupled workstream** (shared
`ChatScreen`↔scene props) — a single owner, sequenced internally; do NOT fan
multiple agents onto `sceneController.ts`/`sceneTypes.ts` at once (the one place
parallel edits collide). Tests/i18n/storybook ride with each workstream.

### Workstream A — `CoreOverviewDialog` (parallel, independent)
- New `features/chat/components/CoreOverviewDialog.tsx` — port `VcCoreDetailD` to a
  DS `Dialog` + DS primitives (no inline styles): ZIBBY status header, overnight
  summary (reuse `useBriefingQuery` from `features/overview` if suitable, else a
  concise status line), 4 stat counts (working/report/await/idle from subsystem
  states), subsystem grid; clicking a subsystem row closes the modal and selects it
  (opens the existing `SubsystemDrawer`, D4).
- `CoreOverviewDialogTestId` enum + `data-testid`s; test with `getByTestId`.
- Storybook story. i18n keys under `chat.overview.*`.

### Workstream B+C — scene retune + interaction (coupled, one owner)
- **B (scene):** retune `orbLayer.ts` (wireframe/simplex central orb), subsystem
  placement in `sceneController.ts` (elliptical orbit), `ringsLayer.ts`→connectors,
  `particleLayer.ts` (per-orb orbital particles + comet handoff retune),
  `backgroundLayer.ts` (mute nebula), `modeVisuals.ts`/`tokens.ts` as needed.
  Preserve the controller's pause/visibility/focus/intersection gating, projection
  subscriptions, and dispose logic. Keep `SubsystemOrbsOverlay` as the a11y/interactive
  layer; update projected label/hit-target positions to the new orbit.
- **C (interaction) in `ChatScreen.tsx`:** make the **central orb clickable** →
  open `CoreOverviewDialog` (new state + handler; wire a click hit-target via the
  overlay or a dedicated center hit-region). Add the **center status pill** to the
  top bar (E may own the pill; coordinate). No `SubsystemDrawer` change (D4).
- Update `CosmicScene.stories.tsx`, `sceneController.test.ts`, `modeVisuals.test.ts`,
  `SubsystemOrbsOverlay.test.tsx`, `CosmicScene.test.tsx` to the new visuals
  (assert contracts/data-mode, not pixels).

### Workstream D — settings/chatUi removal (parallel, independent)
- Delete `features/settings/components/ChatUiSection.tsx` (+ test/story).
- Edit `features/settings/Screen.tsx`: remove the `"chatUi"` tab id, its `Tab`
  declaration, tab-list entry, and `TabPanel`. Keep `"chat"` (persona).
- Delete `features/speech/` **iff** only `ChatUiSection` consumes it (verify:
  `grep -rn "features/speech\|useSpeechStatusQuery\|useSpeechVoicesQuery" apps/web`).
  If anything else uses it, keep those consumers and delete only the dead exports.
- Remove `settings.chatUi.*` i18n keys from `{cs,en}.json`. Leave `settings.chat.*`.
- Do **not** touch `powerSaver`/`ttsVoice` in `system.schema.ts` (D8) — the scene
  (`CosmicScene` reads `powerSaver`) and `useAutoSpeak` (reads `ttsVoice`) still use
  them; only their settings UI is removed. Verify no dangling `SpeechDaemonState`
  import breaks after `features/speech` deletion.

### Workstream E — top-bar status pill (parallel, small)
- Add the "Nominal · N pracují · N hlášení · N čekají" pill to `ChatScreen`'s top
  bar, DS primitives only, counts derived from `useSubsystemsQuery` states. i18n
  keys `chat.statusPill.*`. (Coordinate with C on top-bar layout ownership.)

## 7. Testing, i18n, verification

- Per CLAUDE.md, every touched/new component declares a `<Component>TestId` enum and
  selects via `getByTestId`; ARIA kept as assertions only.
- Component tests stay WebGL-free (jsdom path already renders the scene root + overlay
  without a GPU context — preserve that contract).
- Both `cs` (default) and `en` catalogs updated for every new/removed key.
- After each workstream: `pnpm check:lint` → `pnpm check:types` → `pnpm test`
  (fix all before "done"). Typecheck note: call `tsc -p apps/web` directly — the
  base config doesn't cover apps/web and `rtk pnpm typecheck` masks errors.
- Manual verify: `/chat` renders the orb map + chat below; center orb → overview
  modal; subsystem orb → existing drawer; `/settings` no longer shows the chat-UI
  tab and voice/scene still function (default `ttsVoice`/`powerSaver`).

## 8. Risks & mitigations

- **Scene retune is the deep/risky work** (50 KB controller, shared types). Mitigate:
  single owner, incremental (orb → placement → connectors → particles → handoff →
  background), typecheck+test between steps; I review each diff. Keep the controller's
  lifecycle/dispose/projection code intact — visual-only changes where possible.
- **Parallel collision** on `sceneController.ts`/`sceneTypes.ts` — only B+C touches
  them; A/D/E never do.
- **Dead-code over-deletion** (speech domain) — verify consumers before deleting;
  delete only what nothing else imports.
- **`powerSaver`/`ttsVoice` regressions** — leaving them wired is deliberate; a test
  should still cover the scene reading `powerSaver` and `useAutoSpeak` reading `ttsVoice`.

## 9. Acceptance criteria

1. `/chat` shows the Velín-D orb map (wireframe central orb + 8 orbiting subsystem
   orbs on an ellipse, connectors, per-orb task particles, handoff flares), with the
   existing chat transcript + composer below and the left tasks panel intact.
2. Clicking the central orb opens `CoreOverviewDialog` (real data); clicking a
   subsystem opens the existing `SubsystemDrawer`.
3. Top bar shows the live status pill.
4. `/settings` has no `chatUi` tab; `features/speech` dead code removed; voice reply
   and the scene still work on their persisted config values.
5. `pnpm check:lint`, `tsc -p apps/web`, and `pnpm test` all green; `cs`+`en`
   catalogs consistent; no orphaned imports/keys.

## 10. Open items for review

- None blocking. Confirm the overview-modal "overnight summary" source: reuse
  `useBriefingQuery` vs. a lighter derived status line (planner leans: reuse briefing
  if it's cheap; else derived line).
