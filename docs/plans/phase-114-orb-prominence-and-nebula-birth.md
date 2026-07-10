# Phase 114 — Orb prominence & nebula born from the orb

> Follow-up to Phase 113c. The nebula framing landed, but the orbs still read as
> faint — they sink into the sky instead of sitting *in front of* it. Operator
> feedback (cs): _"orby v chat UI jsou nevýrazné, zapadají do pozadí kde je mlhovina.
> Mlhovina se mi líbí, ale měla by být spíš jen okolo orbů. Zkus i zanimovat, že
> mlhovina vznikne z centrálního orbu stejně jako ostatní orby."_
>
> Three concerns: **(1) make the orbs pop**, **(2) move the nebula to be _around_ the
> orbs, not under them**, **(3) animate the nebula being _born from_ the central orb**,
> the same mitosis gesture the mini-orbs already use.

## Why the orbs look weak today (root cause, verified in source)

1. **The central orb glows _less_ than its own children.** `orbLayer.ts` defaults are
   `GLOW_STRENGTH = 0.35` / `GLOW_SCALE = 1.25` (L28-29), but the 8 mini-orbs are built
   with `glowStrength: 0.4` / `glowScale: 1.35` (`sceneController.ts` L310-316). The hero
   of the scene is dimmer than the satellites.
2. **The nebula is brightest exactly where the orbs are.** In `backgroundLayer.ts`'s sky
   shader the cloud density is boosted _toward_ the cluster:
   `float nebulaBoost = mix(0.45, 1.2, clusterFalloff);` (L116) with
   `clusterFalloff = smoothstep(1.35, 0.05, clusterDist)` (L107). So the fbm clouds peak
   at `clusterDist ≈ 0` — directly behind the wireframe orbs — and the additive cloud
   colour competes with / washes over the orb's own wires and halo. Phase 113 pooled the
   nebula _on_ the cluster; the operator wants it _around_ the cluster.
3. **No tone mapping.** Both renderers (`sceneController.ts` L242, L250) render in raw
   linear with no `toneMapping`/`outputColorSpace`, so bright orb glow has no headroom to
   separate from the mid-bright sky — everything sits in the same muddy band.
4. **The sky just fades in flatly.** `uReveal` is a single global `min(1, elapsed/1.5)`
   opacity multiply (`backgroundLayer.ts` L140, L328-329). It does not emanate from
   anywhere — it has no relationship to the orb the way the mini-orbs' mitosis does.

## Design intent (the target look)

- The **central orb dominates by luminance**, not just size — a brighter, slightly wider
  halo than any mini-orb.
- Directly behind the cluster the sky is **calm and deep** (near the base colour) so the
  wireframe orbs read crisply against near-black; the **nebula clouds billow in a ring
  _around_ the cluster** and fall off again toward the frame edges. The orb keeps its own
  tight, orb-coloured halo (the additive `uOrbColor` glow term) as the seat it sits in —
  that halo is what touches the orb, not the fbm clouds.
- On mount the sky is **born from the central orb**: a soft wavefront blooms outward from
  `uGlowCenter` (the orb's projected position) and grows to fill the frame — reading as
  "the orb divides, the mini-orbs bud out, and the nebula itself blooms from the same
  origin." Under reduced motion it resolves near-instantly (no travelling wavefront).

---

## Delivery — 3 commits

Each commit must pass, in order:

```bash
pnpm check:lint
npx tsc -p apps/web/tsconfig.json --noEmit   # web project only — see note below
pnpm test
```

> **Typecheck note (project memory):** `apps/api/src/machine/machine.service.ts` has a
> **pre-existing, unrelated** tsc error, so the full `pnpm check:types` is red before we
> start. This phase touches only `apps/web`, so gate on the web project's tsconfig above.
> Still run `pnpm test` (full) — the API test error does not block vitest.

> **Do NOT run `graphify update .` between commits.** It re-drifts the generated
> self-knowledge note and trips the pre-commit gate on every commit. Instead, at the very
> end of the phase run `graphify update .` **once**, then `pnpm self-knowledge:generate`,
> `git add` the regenerated `.zibby/data/vault/knowledge/self-knowledge.md`, and land a
> final chore commit. For the three feature commits below, the pre-commit hook regenerates
> self-knowledge from stable data only (no graphify run in between) so it should not drift —
> if the gate still fires, run `pnpm self-knowledge:generate` and `git add` the note with
> the commit. Never `rm -rf .playwright-mcp/` (it is git-tracked).

Commit-message convention (repo style): `feat(web): … (phase 114a)` etc., ending with the
`Co-Authored-By:` trailer the repo uses.

---

### Commit 1 — Orb prominence (phase 114a)

**Files:** `apps/web/features/chat/scene/orbLayer.ts`, `apps/web/features/chat/scene/sceneController.ts`.

**1a — Central orb outshines its satellites.** In `orbLayer.ts` raise the *defaults*
(these are the central orb's values; mini-orbs pass explicit overrides so they are
untouched):
- `GLOW_STRENGTH` 0.35 → **0.6** (L29).
- `GLOW_SCALE` 1.25 → **1.4** (L28) so the hero's halo is at least as wide as the
  mini-orbs' 1.35.
- Leave `GLOW_SEGMENTS`, `DETAIL`, noise constants unchanged.

Confirm the mini-orb call site (`sceneController.ts` L310-316) still passes
`glowStrength: 0.4` / `glowScale: 1.35` explicitly — it does, so bumping the defaults keeps
minis where they are and makes the centre clearly brightest. Do **not** raise the mini-orb
values (they must stay subordinate to the hero).

**1b — Tone mapping for luminance headroom.** On **both** renderers
(`sceneController.ts` `bgRenderer` L242, `orbRenderer` L250) set, right after construction:
```ts
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
```
(Set the same on both so the composited canvases match.) ACES rolls off the bright orb
glow gracefully and lets it read as luminous rather than clipped-flat.

> ⚠️ **Verify this does not _darken_ the scene.** ACES can pull mids down. If after this the
> sky looks muddier or the orb dimmer than before, nudge `toneMappingExposure` up (try
> 1.25–1.4) — and if it still reads worse than no tone mapping, **drop 1b entirely** and
> land only 1a; the glow bump is the non-negotiable part. Note in the commit body which way
> it went.

**Verify:** scene renders without console error; the central orb's halo is visibly the
brightest/widest in the cluster. (WebGL screenshots are flaky under swiftshader — do not
gate on a pixel diff; confirm no runtime error and describe the look. See project memory
`zibby-webgl-screenshot-flaky`.) No test changes expected — if a snapshot/constant test
references `GLOW_STRENGTH`/`GLOW_SCALE`, update it to the new value.

---

### Commit 2 — Nebula _around_ the orbs, not under them (phase 114b)

**File:** `apps/web/features/chat/scene/backgroundLayer.ts` (sky fragment shader, L91-141).

**Goal:** deep calm space directly behind the cluster; nebula clouds billow in a **ring**
around it; orb-coloured halo (unchanged term) is the only thing that touches the orbs.

Replace the single monotonic `clusterFalloff`/`nebulaBoost` weighting with an **annular
(ring) profile** so cloud density is *suppressed* in the core and *peaks* in a ring around
the cluster:

- Keep `float clusterDist = length(p - uGlowCenter);` (L105).
- Replace the cloud weighting (currently L107 `clusterFalloff` + L116 `nebulaBoost`) with a
  ring band. Suggested tuning (the implementer should tune the three radii live):
  ```glsl
  // Calm, deep core directly behind the cluster; clouds swell in a ring around it,
  // then thin toward the frame edges. innerR = clear pocket the orbs sit in,
  // peakR ≈ where the cloud is densest, outerR = fade back to the quiet edge floor.
  float innerR = 0.34;
  float peakR  = 0.82;
  float outerR = 1.6;
  float ringUp   = smoothstep(innerR, peakR, clusterDist);   // 0 in the core → 1 at the peak
  float ringDown = smoothstep(outerR, peakR, clusterDist);   // 1 at the peak → 0 at the edge
  float nebulaRing = ringUp * ringDown;                       // a soft annulus, ~0 at centre & edge
  // Keep a low ambient floor everywhere so corners are never pure black, but let the
  // ring carry the visible nebula.
  float nebulaBoost = mix(0.12, 1.35, nebulaRing);
  ```
- Feed `nebulaBoost` into the existing cloud accumulation (L117-118). You may also lift the
  base cloud coefficients slightly to compensate for the suppressed core so the ring reads
  richer — e.g. `* 0.22` → `* 0.26` and `* 0.15` → `* 0.18` (the audit called the nebula
  low-contrast). Tune by eye.
- **Star focus (L120-126):** make the star field follow the same ring-ish emphasis (thin in
  the calm core AND at the edges, fuller in the ring) — or at minimum keep it from peaking
  in the core. A simple change: drive `starFocus` off `(1.0 - ringDown*0.0 ...)` — practically,
  compute `float starFocus = mix(0.6, 1.0, max(nebulaRing, 0.15));` so stars stay present but
  don't pile up right behind the orbs.
- **Orb halo term (L133-134):** this is the tight, orb-coloured seat that _should_ hug the
  orbs — keep it, and it may be tightened so it sits inside the calm core:
  `float glow = smoothstep(0.7, 0.0, clusterDist);` (slightly tighter than 0.85) so the halo
  is a compact luminous cushion right at the orbs rather than a broad wash. Keep
  `col += uOrbColor * glow * glow * 0.5;` (or nudge the 0.5 up to ~0.6 to seat the orbs
  more firmly). This is the term that makes the orbs feel _lit_, distinct from the clouds.
- Keep the vignette (L137-138) and the `col * uReveal` output (L140) — **but** note Commit 3
  changes how reveal works; do Commit 2 against the current global `uReveal` and let Commit 3
  layer on top.

**Constraints:** shader-only, no new layer/canvas, GPU-cheap (mobile path unchanged). The
comment block at L98-135 must be rewritten to describe the new **ring** intent (the current
comments describe "density peaks at the cluster" — that will be the opposite of the new
behaviour and must not be left stale).

**Verify:** the pocket directly behind the orbs is noticeably darker/calmer than the ring
around them; clouds are visible as a halo-ring framing the cluster; edges stay dark; mobile
still renders. Describe the look (screenshots flaky).

---

### Commit 3 — Nebula born from the central orb (phase 114c)

**File:** `apps/web/features/chat/scene/backgroundLayer.ts` (uniforms + shader + `update`).

**Goal:** on first mount the sky blooms outward from `uGlowCenter` (the orb's projected
position) as an expanding wavefront, instead of a flat global fade — the nebula "is born
from the orb," echoing the mini-orbs' mitosis.

Approach — keep it **self-contained in the background layer** (matches Phase 113's "stay on
the background canvas, no controller plumbing unless necessary" constraint). The layer
already owns `elapsed` and `uGlowCenter`; drive the bloom off those:

- Add a `uBirth` uniform (`float`, 0→1) to `SkyUniforms` (L144-153) and the `skyUniforms`
  literal (L182-190), initialised to 0.
- In `update` (L326-343) advance it from the layer's own `elapsed`. Reuse the existing
  `REVEAL_SECONDS` cadence but make the birth run a touch longer than the fade so the
  wavefront is legible — add e.g. `const BIRTH_SECONDS = 1.9;` and
  `skyUniforms.uBirth.value = Math.min(1, elapsed / BIRTH_SECONDS);`. Under
  `ctx.reducedMotion`, snap `uBirth` to 1 immediately (or advance it ~5× faster) so there is
  no travelling wavefront for motion-sensitive users — mirror how the controller's entry
  animation is skipped under reduced motion.
- In the fragment shader, convert the reveal into a **radial wavefront** from `uGlowCenter`:
  ```glsl
  // Birth wavefront: a soft ring of "reveal" expands from the orb outward. Everything
  // inside the front is present; a thin leading edge glints brighter as it passes
  // (the nebula "condensing" out of the orb). maxR spans corner-to-centre so the
  // front clears the whole frame by uBirth ≈ 1.
  float maxR = 1.9;
  float front = uBirth * maxR;
  float birthMask = smoothstep(front, front - 0.35, clusterDist); // 1 inside the front, 0 ahead of it
  float birthEdge = smoothstep(0.18, 0.0, abs(clusterDist - front)) * (1.0 - uBirth); // fades as it completes
  ```
  Then gate the accumulated sky by `birthMask` and add the edge glint. Concretely, multiply
  the nebula + star contributions (and optionally the orb glow) by `birthMask`, and add
  `col += uOrbColor * birthEdge * 0.35;` for the travelling ridge. Finally replace the flat
  `col * uReveal` at output (L140) with `col * max(uReveal, 0.0)` **and** keep the global
  `uReveal` as a gentle overall opacity floor (so t=0 isn't a hard black snap). i.e. the
  final visibility is `birthMask` (shape of the bloom) × `uReveal` (global soft fade). Tune
  so that at `uBirth = 0` the frame is essentially the base deep colour with just the orb
  seat starting to form, and by `uBirth = 1` it is the full Commit-2 look with no seam.
- The orb's own halo (Commit 2's `uOrbColor` glow term) should appear **first** (it is at
  `clusterDist ≈ 0`, so `birthMask` clears it immediately) — this is what makes it read as
  the source the nebula flows out of. Verify the ordering feels right; if the halo pops in
  too abruptly, let it ride a small `smoothstep(0.0, 0.15, uBirth)` ease.

**Constraints:** shader + one uniform only; no controller changes required (the layer
already receives `reducedMotion` in `BackgroundContext`). Do not touch the mini-orb mitosis
timing — this is a parallel, independent bloom that happens to share the origin point. If
the implementer finds the bloom needs to start precisely with the controller's entry clock
(not the layer's own `elapsed`), that is acceptable as a fallback: thread a `birth: number`
through `BackgroundContext` fed from `entryElapsed` — but prefer the self-contained version.

**Verify:** on reload the sky visibly grows outward from the orb (not a uniform fade); the
orb halo leads; under `prefers-reduced-motion` the sky is simply present with no travelling
front; no console error; mobile renders. Keep `CosmicScene.stories.tsx` rendering.

---

## Definition of done

- [ ] Commit 114a — central orb is the brightest/widest halo; tone mapping in (or explicitly
      dropped with a note). Green on lint + web-tsc + test.
- [ ] Commit 114b — calm deep core behind the orbs, nebula ring around them, dark edges;
      stale "peaks at cluster" comments rewritten. Green.
- [ ] Commit 114c — sky is born from the orb as an expanding wavefront; reduced-motion
      resolves instantly; global fade retained as a floor. Green.
- [ ] Scene renders without runtime/WebGL error in dev; mobile path unchanged; Storybook
      scene still renders.
- [ ] **After all three:** run `graphify update .` **once**, `pnpm self-knowledge:generate`,
      `git add` the regenerated self-knowledge note, and land a final `chore(scene): …
      (phase 114 close-out)` commit. Mark this phase's items done.
- [ ] This is a visual-tuning arc — no contract/wire/test-behaviour change expected; if any
      existing scene test asserts a shader constant that moved, update the assertion (not the
      intent).
