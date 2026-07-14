# Immersive Orb Map — Design Spec (Velín-D, phase 1)

**Date:** 2026-07-14 · **Branch:** `feat/velin-d-orb-dashboard` (continues on top of the parked retune)
**Design source of truth:** `design/Z.I.B.B.Y/ZIBBY Velin-D.html` + `design/Z.I.B.B.Y/zibby/*.jsx`
(key files: `velin-d-orb.jsx` = orb rendering, `velin-d-map.jsx` = map layout/connectors/rings/flares, `velin-c-data.jsx` = states/data, `zt.jsx` = tokens)

## Problem

The previous arc *retuned* the old shared-scene Cosmic renderer toward Velín-D. The result does not
match the design: the design has **no shared WebGL scene, no nebula, no WebGL particles/connectors**.
Its architecture is fundamentally different — and fundamentally component-shaped.

## Decisions (operator-approved 2026-07-14)

1. **Greenfield.** Build new components 1:1 to the prototype's architecture. After the swap, **delete
   `apps/web/features/chat/scene/` entirely** (6 701 LOC) so old components cannot be recycled.
2. **No second design system.** New components live in the existing `libs/design-system` under a new
   component bundle **`immersive`** (e.g. `libs/design-system/src/immersive/…`). Reuse existing tokens;
   extend/add tokens where Velín-D needs them (state colors already exist in contracts/DS).
3. **Same branch.** Continue on `feat/velin-d-orb-dashboard`; the retune commits stay in history, the
   new work supersedes them in one future PR.
4. **Phase 1 scope = the "background" of the chat UI only:** orbs, liveliness, connectors, layout,
   gradient background, Storybook playground. Chat transcript/composer, left tasks panel,
   `SubsystemDrawer`, `CoreOverviewDialog`, `StatusPill` all stay as they are and keep working.

## Architecture

### Prototype's model (adopted verbatim)

- **One small WebGL canvas per orb** (`createZOrb`): own renderer/scene/camera/rAF, `low-power`,
  DPR ≤ 2, transparent clear, canvas = `diameter / 0.8` px. Dispose = cancel rAF, `renderer.dispose()`,
  `forceContextLoss()`.
- Everything else is **HTML/CSS/SVG**: icons (stroke-SVG overlay), labels, halo/ping rings (CSS
  keyframes), orbit task-dots (positioned divs, faux-3D projection), connectors (one SVG layer,
  quadratic beziers, marching-ants dash), handoff flares (CSS Motion Path), background (pure CSS
  radial gradient).
- 9 concurrent WebGL contexts (1 core + 8 nodes). Accepted risk — prototype does exactly this;
  mitigations: `low-power`, DPR cap, `detail=1` for nodes, pause when tab hidden/offscreen.
  Documented fallback if contexts ever become a problem: single shared renderer with scissor
  viewports (not built now — YAGNI).

### Layer split: DS `immersive` (generic) vs app adapter (domain)

The DS stays domain-agnostic. Components take colors/states/counts/slots — never contracts types.

**`libs/design-system/src/immersive/` — new bundle, all with stories + testid enums:**

| Component | Responsibility | Key props |
|---|---|---|
| `Orb` | The WebGL wireframe orb (port of `createZOrb`/`ZOrb3D`) | `diameter` (px, number), `hex`, `state`, `detail`, `antialias`, optional `motionOverrides` |
| `OrbitField` | Faux-3D orbiting task dots around a center | `count`, `color`, `baseRadius`, `seed` |
| `OrbNode` | Composed subsystem node: Orb + icon slot + label + status row + halo/ping rings + float + contact shadow | `diameter`, `hex`, `state`, `label`, `statusLabel`, `icon: ReactNode`, `activeCount`, `live`, `onClick` |
| `CoreOrb` | Central orb: Orb + wordmark + heartbeat rings + intensity/thinking pulse | `size`, `hex`, `intensity`, `thinking`, `activeCount`, `onClick` |
| `ConnectorLayer` | Full-bleed SVG, one bezier per node, dash-pulse on live | `center: {x,y}`, `nodes: {x,y,hex,live}[]` |
| `HandoffFlare` | Comet + launch/impact burst along an arc | `from`, `to`, `color`, `onDone` |
| `OrbMap` | Layout + composition: measures container, computes ellipse, renders ConnectorLayer + CoreOrb + OrbNodes + flares | `nodes: OrbMapNode[]` (generic descriptor), `core: {...}`, `insets`, `onSelectNode`, `onSelectCore` |
| `ellipseLayout` (pure fn) | The responsive ellipse math (unit-testable, no DOM) | `(w, h, insets) → {cx, cy, radiusX, radiusY, nodeD, coreSize, positions[]}` |

**`apps/web/features/chat/` — thin adapter (domain composite):**

- `VelinMap` — maps domain → DS: `SubsystemWithStatus[]` + runs/pipelines → `OrbMapNode[]`;
  implements the existing `ChatScreen` seam (same mount point, `onOpenCore`/`onSelectSubsystem`
  callbacks). Reuses `activeRunsBySubsystem` (moved out of `scene/` before deletion, it's a pure fn)
  and the subsystem→icon mapping (DS `Icon` instances passed as slots).

**Sizing-API exception (documented):** immersive components take numeric px `diameter`/`size` props.
These are continuous, viewport-computed layout values (48–76 px nodes, 96–264 px core) — the sealed
Size-enum API does not fit canvas geometry. This exception is scoped to the `immersive` bundle.

## Visual specification (extracted from the prototype — exact values)

### Orb geometry & shaders (`velin-d-orb.jsx`)

- Wire mesh: `IcosahedronGeometry(1, detail)` — core `detail=4`, nodes `detail=1`; `wireframe: true`,
  transparent, `depthWrite: false`. Vertex: displace along normal by
  `(snoise(dir*1.7+(0,0,t))*0.72 + snoise(dir*3.4+(t*0.7,0,0))*0.28) * uAmp`, `t = uTime*uSpeed`.
  Fragment: fresnel `pow(1-|dot(N,V)|, 1.8)` → `alpha = mix(0.6, 0.95, fresnel)` at `uColor`.
- Glow shell: `IcosahedronGeometry(1.12, 2)`, `BackSide`, `AdditiveBlending`, fresnel exp 3.2,
  alpha = `fresnel * uGlow`.
- No lights (fully unlit/shader-driven). Camera `fov=38`, `z=3.63` (sphere fills 80 % of canvas).
- Rotation (state-independent, off under reduced-motion): `y += dt*0.16`, `x += dt*0.07`,
  `z = sin(now*0.12)*0.09`.
- Breathing: 7 s sine; `uAmp *= 1+(breath-0.5)*0.28*B`, `uGlow *= 0.82+breath*0.18`,
  group scale `1+(breath-0.5)*0.03*B`.
- Param easing: exponential toward target, `TAU = 0.2 s` (~95 % in 0.6 s); color via `Color.lerp`.

### Motion state table (`ORB_MOTION`)

| state | amp | speed | glow | breath |
|---|---|---|---|---|
| idle | 0.05 | 0.18 | 0.5 | 1.0 |
| thinking | 0.17 | 0.95 | 0.82 | 0.7 |
| working | 0.15 | 0.85 | 0.78 | 0.75 |
| report | 0.085 | 0.42 | 0.68 | 0.9 |
| await | 0.05 | 0.16 | 0.6 | 1.35 |
| incident | 0.02 | 0.05 | 0.5 | 0.14 |

### Node chrome (CSS, `velin-d-map.jsx`)

- Halo ring: `D+16` px, `1.5px solid <state color>`, shadow `0 0 16px <color>55`; `vcHalo`
  (opacity .45↔.9) 3.4 s (working) / 2 s (other live); static 0.32 when not live.
- Ping ring (await/incident/report only): `D+16` px, 1 px, `vcRing` (scale .72→2.1, opacity .5→0) 2.4 s.
- Contact shadow: ellipse `D*0.86 × 11` px, `<color>44` radial, blur 2 px, `vcShadow` 4 s when live.
- Float: `vcFloat` translateY 0↔−5 px, duration 5–8 s, delay 0–4 s, seeded per node id.
- Icon: 30 px stroke-SVG, `#eef3fb`, overlay z 4 above canvas z 2. Label: sans 600
  `clamp(12, D*0.19, 15)` px; status row: 6 px dot + mono 10.5 px state-colored label.

### OrbitField (task dots)

Seeded PRNG per node id. Per dot: `R = baseR + i*10 + rand*5` (node `baseR = D/2+13`, core `S*0.42`);
inclination 0.5–1.2 rad; speed ±(0.5–1.0)×1.5; size 5–7.5 px. Depth (projected z) drives scale
0.5–1.45×, opacity 0.3–1.0, blur ≤1.4 px, zIndex front/back. Dot = radial-gradient white→color +
glow shadow. Node `count = active runs` (cap 6, reuse existing cap), core `count = 4` fixed.

### CoreOrb extras

- Wordmark "Z·I·B·B·Y" HTML mono text `max(11, S*0.083)` px over the canvas.
- Heartbeat rings ×2: `S*0.72` px, `vcRing`, duration `3.6−lvl*1.4` s, stagger `i*(1.8−lvl*0.7)`,
  `lvl = min(1, intensity + (thinking?0.5:0))`; `intensity = min(0.7, 0.28 + running*0.08)`.
- Thinking pulse: in the prototype a demo timer; in the app driven by chat streaming state
  (`mode`/streaming → `thinking`), not a timer.

### Connectors & flares

- Connector: quadratic bezier center→node, bend 0.08 (`mx=(x1+x2)/2+(y2−y1)*bend`, my analog).
  Base `rgba(255,255,255,0.09)` w1; live overlay: state color, w1.4, opacity .5, dash `2 10`,
  `vcDash` (offset→−80) 3.2 s linear infinite.
- HandoffFlare: arc bend 0.16; launch ring 0.5 s; 3 comet dots (13/10/7 px) on CSS `offset-path`,
  1.3 s, stagger 0.07 s; impact burst core + ring; default color `#ffe066`; instance lifetime ~1.5 s.
  App trigger: run hand-off events (same source the old comet flares used).

### Layout (ellipse, responsive — `ellipseLayout`)

- `leftInset = clamp(0, w*0.32, 336)`; `rightInset = clamp(0, w*0.1, 108)`;
  `cx = w/2 + (leftInset−rightInset)/2`; `usableH = max(220, h − bottomReserve)`.
- `nodeD = clamp(48, usableH*0.2, 76)`; `topPad = nodeD/2+16`; `bottomExtent = nodeD/2+54`;
  `radiusY = max(84, (usableH−topPad−bottomExtent)/2)`; `cy = topPad+radiusY`;
  `coreSize = clamp(96, radiusY*1.5, 264)`; `radiusX = clamp(150, (w−insets)/2−(nodeD/2+64), 340)`.
- 8 nodes evenly on the ellipse from 12 o'clock clockwise: `angle_i = −π/2 + i*2π/8`.
- App insets: left = tasks panel width, bottomReserve = chat dock height (measured, not hardcoded 230).

### Background

Page root: `radial-gradient(ellipse 130% 100% at 50% 42%, #121a27 0%, #0b0e13 62%)`. **Nothing else** —
no nebula, no starfield. (Root gradient already close after the retune; verify exact values.)

### Reduced motion

`prefers-reduced-motion: reduce` → freeze noise time + rotation, `animation: none` on all CSS rings/
float/dash/flare animations. Must be honored in DS components (media query + `matchMedia` in rAF loops).

## Data mapping (app adapter)

| contracts `SubsystemState` | immersive `state` |
|---|---|
| `klid` | `idle` |
| `bezi` | `working` |
| `hlaseni` | `report` |
| `ceka` | `await` |

`incident` and `thinking` exist in the DS bundle (Storybook-playable, core uses `thinking`); the app
maps only the 4 contract states today. Colors: pass each subsystem's contract hex as `hex` (identity),
state colors from DS/ZT tokens (`idle #66737f · working #7aa5f8 · report #3fcf8e · await #f0b429 ·
incident #ff6b6b`). `live = state !== idle`.

## Storybook (a core deliverable, not an afterthought)

Stories in the DS bundle with **argTypes knobs** for: `state` (all 6), `detail` (0–5 — "polygon
count"), `diameter`, `hex`, `activeCount` (orbit dots 0–6), breathing/glow/speed overrides
("vrnění"), icon choice, halo/ping toggles, and an `OrbMap` playground story (all 8 nodes, editable
states/counts, flare trigger button). Storybook already renders live WebGL (CosmicScene stories do);
no config change needed — DS glob covers `libs/design-system/src/**`.

## Replacement seam & deletion

- Seam: `ChatScreen.tsx` (~line 586) — swap `<CosmicScene …>` for `<VelinMap …>` with the same
  callbacks `onOpenCore` / `onSelectSubsystem`; ChatScreen keeps owning state, drawer, dialog.
- Props the new map consumes: `subsystems`, `runs`, `pipelines`, `selectedSubsystemId`, streaming
  flag (for core `thinking`). Old props that die with the scene: `dock`, `streamChars`,
  `completedTick`, `mode` (replaced by a simple streaming boolean).
- **Delete after swap:** all of `apps/web/features/chat/scene/` except pure logic that moves out
  first (`subsystemLoad.ts` + test → adapter folder). Update the 3 known importers
  (`ChatScreen.tsx`, `ChatScreen.test.tsx`, `CoreOverviewDialog.stories.tsx`).

## Testing

- Pure functions (`ellipseLayout`, orbit-dot math, state mapping, seeded PRNG) → unit tests.
- Components: jsdom tests via testid enums for DOM structure/props/callbacks (WebGL gated by a
  `canMountWebGL`-style check — keep/port that tiny util); no WebGL assertions in jsdom.
- `ChatScreen.test.tsx` updated for the new seam. Suite + `tsc -p apps/web` + lint green per repo law.
- Live verify on :3000 against the prototype opened side-by-side (visual parity check).

## Out of scope (phase 1)

Subsystem detail dialog (Velín-D `velin-c-detail`), floating task rail (`velin-c-tasks`), new chat
dock (`velin-d-chat`), dock/search (`velin-d-dock`, `velin-d-search`), migrating existing HUD
components to the immersive language, any DS token overhaul beyond what orbs need.
