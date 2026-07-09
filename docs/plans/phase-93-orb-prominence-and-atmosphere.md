# Phase 93 — Central orb prominence & atmosphere

> Operator brief (CS): _"Hlavní orb musíme udělat výraznější. Nevím jestli má teď nastavenou
> nějakou opacity menší než 1. Případně nasetujme na 1 a rozdíly ve stavech idle a working nebo
> dalších řešme postupnou změnou barvy místo opacity. Atmosféru okolo orbu zmenšíme ať není tak
> daleko od povrchu orbu."_
>
> First phase of the Chat-scene redesign arc (93–97). Deliberately standalone and low-risk: it
> only touches the central orb's own material/dynamics, no layout and no structural change. It
> also **finalizes the orb shader the Phase-95 mini-orbs will reuse**, so it must land first.
>
> RECON (already done, do NOT re-derive):
> - `orbLayer.ts` — fresnel wireframe alpha is `mix(0.16, 0.95, pow(fresnel,1.6))`: head-on
>   wires sit at **0.16**, so the orb reads translucent/faint front-on. The glow shell is a
>   `SphereGeometry(RADIUS * 1.6, …)` — the "atmosphere", currently pooled 60% past the surface.
> - `modeVisuals.ts` — every mode carries an `intensity` multiplier that is `< 1` for the calm
>   states (`idle` 0.5, `listening` 0.78, `thinking` 0.72, `waiting-approval` 0.45). This
>   multiplies the resolved colour (`targetColor.set(token).multiplyScalar(intensity)`), i.e. it
>   **dims** the orb per state — exactly the "opacity < 1 feel" the operator wants gone.
> - `ringsLayer.ts` — the soft halo torus is `TorusGeometry(1.72, 0.13, …)`, i.e. it floats well
>   outside the unit orb; part of the same "atmosphere too far from the surface" note.

## Goals (what "done" looks like)

1. **Full presence.** The orb no longer reads dim/translucent front-on. Raise the fresnel alpha
   floor so the whole shell is clearly present; keep the silhouette rim the brightest part (the
   shell character stays — it just stops looking faded).
2. **State by hue, not by dimming.** Keep the resolved colour at (near) full intensity for
   ALL states. The idle→working distinction is carried by **colour/hue**, not by a brightness
   drop:
   - `idle` — calm **accent**, full presence.
   - `listening` — accent, subtly shifted brighter/warmer (still clearly "awake but calm").
   - `thinking` / `tool` — shift toward the **run** hue (the "working" colour) so the change
     from idle to working is a visible colour transition, eased over the existing damping (it
     must remain a *postupná změna barvy*, never a snap).
   - `streaming` — stays **run** (already is).
   - `waiting-approval` — stays **warn** (amber), `error` — stays **bad** (red). These already
     read as hue-distinct; just remove the heavy intensity dimming so they're present, not faded
     (a slightly-lower-than-1 intensity is fine for `waiting-approval` if needed for calm, but no
     more 0.45).
   Net: `intensity` values move to ~`0.9–1.0` across the board; the per-state *difference* moves
   into `colorToken`/hue + the existing noise/pulse dynamics (which already differ per mode and
   should be preserved).
3. **Atmosphere hugs the surface.** Pull the glow shell in from `1.6×` to roughly `1.22–1.30×`
   the orb radius so the halo sits close to the surface rather than pooling far out. Bring the
   `ringsLayer` halo torus radius in to match (roughly `1.40–1.50`) so, when it fades in during
   live states, it too hugs the orb. Keep both soft/feathered — smaller, not harder.

## Files (expected touch set — keep it minimal)

- `apps/web/features/chat/scene/modeVisuals.ts` — `intensity` per mode → ~0.9–1.0; retune
  `colorToken` so idle=accent and thinking/tool lean toward run (the working hue). Keep the
  `noiseAmp/noiseSpeed/rotationSpeed/pulse*/glow/rings` dynamics per mode intact (only touch
  colour/intensity unless a dynamic obviously fights the new look).
- `apps/web/features/chat/scene/orbLayer.ts` — raise `ORB_FRAGMENT` alpha floor (the `0.16`);
  shrink `glowGeometry` radius multiplier (`1.6` → ~1.25). Do NOT change the noise/pulse
  update math or the `flash` handling.
- `apps/web/features/chat/scene/ringsLayer.ts` — bring the torus radius in (`1.72` → ~1.45),
  keep the feather/breathe/spin logic and `HALO_ALPHA` restraint unchanged.

Do not touch `ORB_SCALE` in `sceneController.ts` (the orb's world size is a Phase-94 composition
concern), the background sky glow (`backgroundLayer.ts` — Phase 94), or any React/DOM file.

## Constraints

- **Nothing snaps.** All state is already eased toward its target via `damp()` / lerp in the
  update loops — the hue change from idle→working must ride that same easing. Do not add hard
  cuts.
- **Reduced motion** must stay honored (the `reducedMotion` branches in `orbLayer`/`ringsLayer`
  stay; a colour/opacity change is fine under reduced motion, motion is not).
- **No new tokens / no private hex.** Colours still come from `resolveSceneTokens()` (the shared
  DS resolver). Hue "shift" = choosing a different existing `SceneColorToken` per mode +
  intensity, not inventing a colour.
- Keep the shell aesthetic: the orb is still a translucent wireframe icosahedron with a fresnel
  rim — this phase makes it *present*, it does not make it an opaque ball.
- Tailwind/DS rules still apply if any TS constant changes, but no JSX changes are expected.

## Tests

- `modeVisuals` is pure: add/extend a unit test asserting the new invariants —
  (a) every mode's `intensity >= ~0.85` (no more heavy dimming), (b) `idle.colorToken === "accent"`,
  (c) the working modes (`thinking`/`tool`/`streaming`) resolve to the `run` hue (or otherwise a
  DIFFERENT token than `idle`), so "idle vs working differs by colour" is locked by a test, not
  just by eye. (Check whether `modeVisuals.test.ts` exists; extend it, else add one next to the
  module.)
- The shader/material changes in `orbLayer`/`ringsLayer` have no pure unit surface (WebGL) — they
  are covered by the visual verification below, same as every prior scene phase.

## Verification (paste real output in the diff hand-back)

- `npx tsc -p apps/web/tsconfig.json --noEmit` — clean (note: `apps/api/machine.service.ts` has a
  PRE-EXISTING unrelated error; do not touch it and do not report it as yours).
- `npx eslint <touched files>` — clean.
- `npx vitest run apps/web/features/chat/scene` — green.
- Visual: run the app (`pnpm web:dev`), screenshot `/chat` in `idle` and again while a turn
  streams (`streaming`/`tool`), showing (a) the orb reads present/bright front-on, (b) idle vs
  working is a clear colour difference, (c) the halo/atmosphere hugs the surface. Save screenshots
  to the scratchpad, not the repo.

## Out of scope (later phases)

- Orb world position / size, top-third composition, behind-orb sky glow → Phase 94.
- Mini-orbs, octagon, net, DOM overlay, mitosis → Phases 95–97.
