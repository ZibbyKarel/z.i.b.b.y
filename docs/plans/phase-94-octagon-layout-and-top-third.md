# Phase 94 — Octagon layout + top-third composition

> Operator brief (CS): _"Posuneme orba a subsystémy do horní třetiny stránky. Nebude to
> uprostřed abychom měli místo na chat dole. Subsystémy budou okolo hlavního orbu rozprostřené
> pravidelně v oktagonu. Forge chci mít ale ve spodu. Síť mezi subsystémy nesmí kolidovat s
> orbem uprostřed. Místo toho se síť nebude spojovat do jednoho bodu uprostřed ale bude okolo
> orbu také v pravidelném oktagonu."_
>
> Second phase of the chat-scene redesign arc (93–96). Deliberately kept in the EXISTING
> rendering tech (WebGL central orb + **SVG** `SubsystemWeb` overlay) — no mini-orbs yet — so it
> stays low-risk and preserves all interaction / keyboard / aria / testids / handoff particles.
> It delivers four of the operator's asks at once: **top-third composition, a regular octagon,
> Forge anchored at the bottom, and an orb-avoiding octagon net.** The WebGL mini-orbs come in
> Phase 95.
>
> RECON (already done — do NOT re-derive):
> - `subsystem-web-geometry.ts` — pure module: `computeSlots()` places 8 points on a FLATTENED
>   ellipse (`WEB_RY_RATIO = 0.35`) starting at the TOP (`-90°`) in registry order (index 0 =
>   `forge`). Spokes = `WEB_CENTER → node`; rim = neighbour → neighbour on the ellipse. `pathFor`
>   (particles) treats `"orb"` as `WEB_CENTER`. Registry order: forge, puls, sentinel, maestro,
>   beacon, scout, herald, loom.
> - `SubsystemWeb.tsx` — SVG overlay; draws Spokes (`WEB_CENTER→slot`), Rim (neighbour edges),
>   Particles, then the 8 interactive `<g role="button">` nodes. Testids: `Root/Spokes/Rim/
>   Particles/Particle/Node-<id>/Badge-<id>`.
> - `ChatScreen.tsx` — the SubsystemWeb overlay is a full-bleed `absolute inset-0 flex items-
>   center justify-center` wrapper (concentric with the screen-centered orb). Transcript is a
>   bottom-anchored `h-1/2 max-w-[720px]` scroll box with a top fade mask; composer pinned at the
>   bottom.
> - `sceneController.ts` — orb + rings live in a half-scale `core` group at world origin; camera
>   at `(0,0,6)` looks at `(0,0,0)` (with a small drift that re-`lookAt(0,0,0)`), so the orb
>   projects to screen centre.
> - `backgroundLayer.ts` — the behind-orb glow in `SKY_FRAGMENT` is centred at screen centre
>   (`length(p)`, `p = (uv-0.5)*vec2(uAspect,1)`).

## Goals (what "done" looks like)

1. **Orb + subsystem cluster sit in the TOP THIRD, not the centre.** The central orb and the 8
   subsystems occupy roughly the top third; the lower ~two-thirds are clear for the chat
   (transcript + composer). The orb and the SVG overlay must stay CONCENTRIC after the move
   (they move up together and remain aligned — this is the key visual acceptance check).
2. **Regular octagon, Forge at the bottom.** The 8 nodes sit on a regular octagon (equal radius
   — a circle, not the flattened ellipse), evenly 45° apart, with **`forge` anchored at the
   bottom (6 o'clock)** and the rest following in registry order around the ring. Choose a
   consistent direction (clockwise) and document it.
3. **Net rings the orb — never touches it.** Replace the "spokes converge on the centre point"
   with an **inner octagon hub**: 8 hub vertices on a small ring around the orb (radius chosen so
   the ring clears the orb's rendered radius with margin). Each node connects by a short radial
   spoke to ITS hub vertex (node → hub vertex, stopping at the hub — never reaching the centre);
   the 8 hub vertices are joined edge-to-edge into the inner octagon. Nothing in the net overlaps
   the central orb.
4. **Chat has room below.** The transcript occupies the region below the cluster (taller than
   today's `h-1/2` if needed), composer stays pinned at the bottom, top fade mask preserved so
   turns dissolve upward under the cluster.

## Files (expected touch set)

- `apps/web/features/subsystems/components/SubsystemWeb/subsystem-web-geometry.ts`
  - Octagon: make the node ring a CIRCLE (equal rx/ry) so 8 points at 45° form a regular
    octagon; use a squarer viewBox (e.g. ~`480×480`) so `preserveAspectRatio xMidYMid meet`
    doesn't distort it. Anchor the start angle at the BOTTOM (`+90°`) so index 0 (`forge`) is at
    6 o'clock; proceed clockwise.
  - Add the inner hub: a `HUB_RADIUS` (< node radius ring, > orb rendered radius + margin), a
    `hubVertexForIndex/Id` returning the hub point at the same angle as each node, and
    `hubEdges()` for the inner-octagon ring. `spokePath` becomes `node → hubVertex` (radial,
    stops at the hub). `pathFor("orb", node)` / `("node","orb")` now uses the node's HUB VERTEX as
    the `"orb"` endpoint (so a dispatch/report particle rides the spoke from just outside the orb
    to the node, never through the centre).
  - Keep the module pure and keep the id-keyed slot assignment (positions never reflow with feed
    order). Update `subsystem-web-geometry.test.ts` for the new angles / hub / paths (Forge at
    the bottom, spokes end at the hub, hub edges form a closed ring, `pathFor` rides the spoke).
- `apps/web/features/subsystems/components/SubsystemWeb/SubsystemWeb.tsx`
  - Draw Spokes as node→hub and the Rim group as the inner-octagon hub ring (keep the `Spokes`
    and `Rim` testids — semantics updated in a comment; do not add/remove testids so existing
    tests keep their selectors). Nodes/badges/selection/particle rendering otherwise unchanged.
  - Update the reduced-motion particle destination (`WEB_CENTER`) to the node's hub vertex to
    match the new `pathFor`.
- `apps/web/features/chat/components/ChatScreen.tsx`
  - Reposition the SubsystemWeb overlay wrapper into the TOP THIRD, centred horizontally and
    aligned so its centre coincides with the (now-raised) orb. Size it for a square-ish octagon.
    Keep `pointer-events-none` on the wrapper, interactive nodes re-enable events (unchanged).
  - Give the transcript the lower region (grow it below the cluster; composer stays bottom; keep
    the top fade mask). Left `ChatTasksPanel` and the subsystem drawer unchanged.
- `apps/web/features/chat/scene/sceneController.ts`
  - Raise the orb cluster into the top third: translate the `core` group up in world Y by a new
    `CLUSTER_Y` constant (tune so the orb lands in the top third and stays concentric with the
    SVG overlay). Rings move with it (already in `core`). Keep `ORB_SCALE`.
  - Pass the cluster's projected screen offset to the background so the behind-orb glow follows
    (see below). Camera unchanged (still `lookAt(0,0,0)`); only the cluster moves.
- `apps/web/features/chat/scene/backgroundLayer.ts`
  - Add a `uGlowCenter` (vec2, NDC/uv-space) uniform to `SKY_FRAGMENT`; centre the behind-orb
    glow on it (`length(p - uGlowCenter)`) instead of screen centre, so the glow pools behind the
    raised orb. Default keeps today's centred look until the controller sets it. Expose a setter
    on `BackgroundLayer` and have the controller feed the orb's projected position.

## Constraints

- **Concentric after the move.** The single most important check: the WebGL orb and the SVG
  overlay's centre must coincide once both are raised. Tune `CLUSTER_Y` + the overlay wrapper
  together and VERIFY on screen.
- Pure geometry stays pure/tested; no React or DOM in `subsystem-web-geometry.ts`.
- No inline `style={{}}` on DOM in `apps/web` beyond the file's existing sanctioned
  eslint-disable header; prefer DS primitives / Tailwind arbitrary values (`aspect-*`,
  `max-w-[…]`, positioning utilities) for the layout change.
- Colours unchanged (subsystem hexes from the registry; net strokes stay `foreground-faint`).
- Reduced motion honored (no new motion added this phase).
- Do NOT introduce mini-orbs / WebGL nodes / projection overlay / mitosis — those are Phases
  95–96. This phase is octagon + composition only.

## Tests

- `subsystem-web-geometry.test.ts` — Forge slot is at the bottom (max y, angle `+90°`); the 8
  slots are a regular octagon (equal radius within rounding, 45° apart); `hubEdges()` returns a
  closed 8-edge ring; a spoke ends at the hub vertex (not the centre) and is radial;
  `pathFor("orb", id)` starts at the hub vertex.
- `SubsystemWeb.test.tsx` / `SubsystemWeb.particles.test.tsx` — keep passing with the same
  selectors (Spokes/Rim/Node-<id>/…); update only assertions that encoded the old ellipse/centre
  geometry, never the selector set (testid-first rule).
- `ChatScreen.test.tsx` — keep green; update any assertion tied to the old overlay position.

## Verification (paste real output in the hand-back)

- `npx tsc -p apps/web/tsconfig.json --noEmit` — clean (ignore the PRE-EXISTING unrelated
  `apps/api/machine.service.ts` error; do not touch it).
- `npx eslint <touched files>` — clean.
- `npx vitest run apps/web/features/chat apps/web/features/subsystems` — green.
- Visual (REQUIRED): screenshot `/chat` showing (a) the orb + octagon of subsystems in the top
  third, (b) `forge` at the bottom, (c) the net as an inner octagon ring + short spokes that
  never touch the orb, (d) clear chat space below, (e) orb and overlay concentric. Save
  screenshots to the scratchpad, not the repo (and never delete the repo-tracked `.playwright-mcp/`).

## Out of scope (later phases)

- WebGL color-unique mini-orbs per subsystem + projection-driven DOM overlay + WebGL net →
  Phase 95 (this phase's SVG nodes/net are the interim; they get replaced there).
- Mitosis / fork-on-load entry animation → Phase 96.
