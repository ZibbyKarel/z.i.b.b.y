# Phase 115 — Remove the under-orb pool, give the orbs their own pulsing halo

> Follow-up to phase 114. The operator's verdict after 114 landed: the nebula now
> frames the orbs (good), **but there is still a glow / something pooled _under_ the
> orbs, and the orbs still don't read as prominent.** Two commits, in order:
>
> **115a** — remove the background-canvas glow pool that sits under the orbs.
> **115b** — replace it with a glow that _emanates from the orbs themselves and
> pulses with them_ (a living, breathing halo), so each orb is self-luminous instead
> of relying on a flat pool painted behind it.
>
> Same working agreement as phase 114: this plan is the contract; a **Sonnet
> subagent implements**; the author only reviews and returns correction notes and
> **does not edit code**. Commit progressively; each commit green on
> `pnpm check:lint && pnpm check:types && pnpm test` before it lands, then
> `graphify update .`.

---

## Root-cause analysis (why the orbs still read faint)

The scene is two stacked WebGL canvases: an **opaque background canvas**
(`backgroundLayer.ts` — nebula, stars, node-web) UNDER a **transparent orb canvas**
(`orbLayer.ts` instances — the central orb + 8 mini-orbs), CSS-composited.

1. **The persistent "glow under the orbs" is the background seat term.**
   `backgroundLayer.ts` SKY_FRAGMENT L163-174:
   ```glsl
   float glow = smoothstep(0.7, 0.0, clusterDist);
   col += uOrbColor * glow * glow * 0.6 * smoothstep(0.0, 0.15, uBirth);
   ```
   This paints an orb-coloured pool onto the *background* canvas, centred on the
   cluster, that persists forever once `uBirth → 1`. Because it is drawn **behind**
   the wireframe orbs on a lower canvas, it fills the orbs' interior with the same
   hue as the wires — flattening their contrast and reading as "a glow pooled under
   them". This is what the operator wants gone. (The `birthEdge` ridge on L176-179 is
   transient — it multiplies by `(1.0 - uBirth)` and is 0 at rest — so it is NOT the
   culprit and stays; it is part of the birth bloom the operator liked.)

2. **The orb's own halo is static at idle and barely present.** In `modeVisuals.ts`
   the `idle` target has `pulseAmp: 0, pulseSpeed: 0` (L54-55) — so in
   `orbLayer.ts:222` `pulse = pulseAmp * (…) = 0`, the halo neither breathes nor
   scales, and `glowUniforms.uStrength = glow` flat. The comment on `idle` even
   promises "gentle breathing" (modeVisuals.ts:47) — it was never wired.

3. **Phase 114a's `GLOW_STRENGTH 0.35→0.6` had no lasting effect on the central
   orb.** `orbLayer.ts` seeds `let glow = glowStrengthBase` then every frame
   `glow = damp(glow, target.glow, dt)` (L219). Within ~0.6s `glow` settles to
   `target.glow` (0.35 at idle) regardless of the 0.6 seed. So the resting central
   halo is still 0.35 — the real lever is `target.glow` + the strength formula, not
   the seed constant. (114a's tone-mapping change was the only lasting part.)

**Intent for 115:** the light that seats an orb should come FROM the orb — move with
it, share its colour, and breathe on a slow idle rhythm — not be a flat pool on the
sky behind it. Removing the pool (115a) and strengthening + animating the orb's own
additive halo (115b) makes the orbs self-luminous and visibly alive at rest.

---

## Delivery — 2 commits

### Commit 115a — remove the under-orb background glow pool

**File:** `apps/web/features/chat/scene/backgroundLayer.ts`

- **Delete the seat-glow term** — SKY_FRAGMENT L163-174 (the `float glow =
  smoothstep(0.7, 0.0, clusterDist);` line and the `col += uOrbColor * glow * glow *
  0.6 * smoothstep(...)` line) plus its comment block. Do **not** touch:
  - the nebula **ring** (L126-151),
  - the star layers (L153-161),
  - the **birthEdge** ridge (L176-179) — transient, part of the birth bloom,
  - `uGlowCenter` / `uOrbColor` uniforms or `setGlowCenter` — still consumed by
    `clusterDist` (ring + birth centre) and the birthEdge ridge respectively. Leave
    all uniform plumbing intact.
- **Update the stale doc comments** that describe the removed pool: the pass-1
  summary at the top of the file (L11-14, "a soft glow pooled behind the orb …") and
  any inline mention, so the file no longer claims a behind-orb pool exists.
- **Reduced-motion / birth:** unchanged — the nebula ring and birthEdge already
  handle both. The birth still blooms outward from `uGlowCenter`; its visible "seed"
  at t≈0 is now the orb's own halo on the canvas above (which 115b makes brighter),
  not the deleted pool. Verify the birth still reads as originating at the orb.

**Expected result:** the orbs' interiors are no longer washed with a background pool;
the wireframe reads crisply against the calm core; the nebula ring is unchanged.
Between 115a and 115b the orbs may look slightly *less* seated — that is expected and
is what 115b restores, correctly this time.

**Tests / checks:** no test asserts on this shader term (visual-only). Run the full
gate. WebGL screenshots are flaky under swiftshader — do **not** gate on a pixel
screenshot; confirm the scene compiles and renders without a GL/shader error (load
`/chat` against the dev server, check the console) and describe the intended look.

---

### Commit 115b — a pulsing halo that emanates from the orbs

**File:** `apps/web/features/chat/scene/orbLayer.ts` (and a small
`modeVisuals.ts` resting-glow lift — see below).

Goal: every orb carries its own additive glow shell that (a) is bright enough to
seat the orb now that the background pool is gone, and (b) **breathes on a slow
always-on rhythm** even at idle, on top of the existing mode/energy pulse. The halo
already exists (the back-side additive `glowMesh`, L173-189) — this makes it living
and prominent.

**b1 — always-on breath oscillator (the "pulses with them" part).** In the closure
add a dedicated breath phase accumulator, independent of the mode `pulsePhase` (which
is 0-amplitude at idle):

- Add `let breathPhase = 0;` alongside the other damped state (near L198).
- Define module consts near the other tunables (L28-34):
  ```ts
  /** Always-on idle "breath" of the glow halo — a slow swell/brighten the orb
   * carries in every state, on top of the mode/energy pulse. Gated off under
   * reduced motion. Period ≈ 2π / BREATH_SPEED ≈ 7s. */
  const BREATH_SPEED = 0.9;      // rad/s
  const BREATH_GLOW_AMP = 0.35;  // fraction of base strength the breath adds/removes
  const BREATH_SCALE_AMP = 0.06; // shell-radius swell fraction
  ```
- In `update()`, after the existing `pulsePhase`/`pulse` block (L221-222):
  ```ts
  breathPhase += reducedMotion ? 0 : dt * BREATH_SPEED;
  const breath = reducedMotion ? 0 : Math.sin(breathPhase); // [-1, 1], mean 0
  ```
  Use a **signed** oscillation (mean 0) so the breath swells above and dips below the
  resting halo rather than only ever adding — the halo pulses, it doesn't just get
  bigger.
- Fold breath into the halo strength and shell scale (replacing L252-253):
  ```ts
  glowUniforms.uStrength.value =
    glow * (1 + pulse + breath * BREATH_GLOW_AMP) + flash * 0.5;
  glowMesh.scale.setScalar(1 + pulse * 0.5 + breath * BREATH_SCALE_AMP);
  ```
  The orb-body scale (L243-244) stays driven by the mode `pulse` only — the breath is
  a **halo** effect (emanation), not a body wobble.

**b2 — lift the resting halo so the orbs are actually prominent.** Because the halo
strength settles to `target.glow` (root-cause #2/#3), raise the resting glow targets
in `modeVisuals.ts` so the orbs seat themselves now that the background pool is gone:

- `idle.glow` 0.35 → **0.55**, `listening.glow` 0.5 → **0.62** (central orb resting /
  composing states — the two the operator stares at most).
- Mini-orbs `MINI_BASE`: `klid.glow` 0.18 → **0.3**, `hlaseni.glow` 0.42 → **0.48**
  (the calm mini states; leave `bezi`/`ceka` — they are already lifted by their
  pulse). Keep the relative ordering (klid dimmest).
- Leave `thinking`/`streaming`/`tool`/`waiting-approval`/`error` central values as-is
  — they already carry higher glow and/or a pulse.
- These are **starting values** — tune for "clearly prominent, not blown out". The
  `GLOW_STRENGTH` seed const (orbLayer.ts:29) can stay 0.6; it only affects the first
  ~0.6s. Do not raise it as the fix — the target is the lever.

**b3 — (optional, only if the halo still reads as a hard disk) broaden the shell
falloff.** GLOW_FRAGMENT L88 `pow(…, 3.0)` controls how tightly the halo hugs the
silhouette. If after b1/b2 the emanation looks like a hard ring rather than a soft
bloom, lower the exponent toward ~2.5 for a broader, softer glow. Change this only if
needed and note it in the handoff; otherwise leave it.

**Reduced motion:** the breath must be fully gated (`breathPhase` frozen, `breath =
0`) exactly like the existing pulse — motion-sensitive users get a steady, brighter
halo with no oscillation. Verify.

**Both the central orb and the 8 mini-orbs get the breath** (they share
`createOrbLayer`) — this is intended: the whole cluster breathes together, which is
the "pulzuje s nimi" the operator asked for. Confirm the mini-orbs still read as
subordinate to the central orb (they will — their `glow`/`intensity` targets are
lower).

**Tests:**
- `modeVisuals.test.ts` — update any assertion that pins the changed `glow` values
  (idle/listening/klid/hlaseni). Keep every other assertion. If the test asserts
  relative ordering (e.g. klid < bezi), preserve it.
- No new test is required for the breath (it is a time-driven visual), but if there
  is an existing `orbLayer` unit test that drives `update()` and inspects uniforms,
  keep it green (the breath at `breathPhase=0` is `sin(0)=0`, so a single-frame
  assertion at t=0 is unaffected; a reduced-motion assertion must still see no
  oscillation).
- Full gate green.

**Verify (visual):** at idle the central orb has a soft halo that slowly breathes
(≈7s period) and clearly seats it against the calm core; under reduced motion the
halo is steady and bright, no pulsing; during `tool`/`streaming` the mode pulse still
reads on top of the breath. Describe the look; do not gate on a swiftshader
screenshot.

---

## Definition of done

- [ ] **115a** — background seat-glow term removed; nebula ring, stars, birthEdge and
      all uniform plumbing intact; stale comments updated; scene renders without a GL
      error.
- [ ] **115b** — always-on breath oscillator on the orb halo (strength + shell
      scale), gated by reduced motion; resting `glow` targets lifted
      (idle/listening/klid/hlaseni); orbs read prominent and alive; mini-orbs still
      subordinate.
- [ ] Each commit green on `pnpm check:lint && pnpm check:types && pnpm test`.
- [ ] `graphify update .` run after each commit; self-knowledge note refreshed if the
      pre-commit gate requires it (run the generator once, at the end).
- [ ] No push — work stays local on `main` for the operator's review.
```
