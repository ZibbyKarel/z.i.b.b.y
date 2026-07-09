# Phase 103 — Hero art engineering follow-ups (tests, band height, WebP)

> TODO ("Fáze 90 (hero art) — dodělat"). This phase takes the **engineering-tractable** subset;
> the taste/design items are explicitly deferred below with reasons.

## Recon (verified)

- Registry: `libs/contracts/src/subsystems/subsystem.schema.ts` — `SUBSYSTEMS` (8 entries), each
  `heroImage: "/subsystems/<id>.jpg"`, `color` hex. Test:
  `libs/contracts/src/subsystems/subsystems.contract.test.ts` asserts length/uniqueness/shape and
  that every `heroImage` matches `/subsystems/<id>.jpg` — but does NOT check the file exists.
- Drawer header: `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx`,
  `heroBandStyle(color, heroImage)` (l.97–111): fallback branch = radial glow only; image branch =
  `backgroundImage: \`${glow}, url("${heroImage}")\``, `backgroundSize:"auto, cover"`,
  `backgroundPosition:"center, center 22%"`, `minHeight:168`. Applied at l.205 (testid
  `subsystem-drawer-hero`). Test `SubsystemDrawer.test.tsx` fixture uses `heroImage: null` → only
  the fallback branch is covered; the `url(...)` image branch is UNTESTED.
- Assets: `apps/web/public/subsystems/*.jpg` (8 files, 70–131 KB). No WebP.
- Tooling available in this env: Python **Pillow** (WebP-capable). No sharp/imagemagick/cwebp.

## In scope (this phase)

### A — Tests (TODO item 1)
1. **Drawer-header image branch.** In `SubsystemDrawer.test.tsx` add a case with a fixture whose
   `heroImage` is a real path (e.g. `"/subsystems/forge.webp"` or `.jpg`): assert the hero
   Container's background (via `getByTestId(SubsystemDrawerTestId.Hero)`) includes `url(` and the
   image path (image branch). Keep the existing `heroImage: null` fallback case (assert NO `url(`,
   glow present). Selector = testid; keep role/attr as assertions only, per DS conventions.
2. **Registry asset existence.** Extend `subsystems.contract.test.ts` with a vitest `fs` check:
   for every `SUBSYSTEMS` entry, resolve its `heroImage` under `apps/web/public` and assert the
   file exists on disk (build-time-ish guard so a registry path can't drift from a missing asset).
   Use `node:fs`/`node:path` relative to the repo root; skip cleanly if the public dir isn't
   resolvable in the test CWD (compute path from `import.meta.url`). If the webp migration (C)
   lands, the registry points at whatever base path is chosen — assert the actual referenced file
   exists.

### B — Hero band height (TODO item 3)
The band is content-driven (~120px) so the portrait art is a thin strip. Give it room to breathe:
raise the hero `minHeight` (e.g. 168 → ~220–240) and/or express a fixed aspect band so the figure
reads. Prefer tuning `heroBandStyle`'s `minHeight` + `backgroundPosition` (keep `cover`); consider
the `EntityHero imageBleed` idiom used in run-detail (`phase-53`/`phase-60`) only if it's a clean
reuse — otherwise keep the local band and just enlarge it. Verify the fallback (no image) band
still looks intentional at the new height. Update the drawer test's height assertion if it asserts
`minHeight`.

### C — WebP optimization (TODO item 4)
Convert the 8 JPGs to WebP (Pillow) and serve WebP with a JPG fallback:
1. Add a small, committed conversion script `apps/web/public/subsystems/convert-to-webp.py`
   (documented, re-runnable) that reads each `*.jpg` and writes `*.webp` (quality ~80, method 6).
   Run it → produce `apps/web/public/subsystems/*.webp`. Keep the JPGs as the fallback source.
2. In `heroBandStyle`, emit a CSS `image-set()` so the browser picks WebP when supported and falls
   back to JPG — derive the webp path from the heroImage path (swap extension) so the registry
   contract (single `/subsystems/<id>.jpg` string) is UNCHANGED:
   ```
   backgroundImage: `${glow}, image-set(url("${webp}") type("image/webp"), url("${jpg}"))`
   ```
   Keep the glow layer and `backgroundSize/Position`. If a target-browser matrix makes `image-set`
   risky, ship WebP directly in the registry with the JPGs retained — but prefer image-set for the
   graceful fallback. Confirm the `url(` assertion in test A still matches (it will — image-set
   contains `url(`).
   - Note: the image-branch test (A) should assert both the `image-set(`/`url(` presence.

## Deferred (NOT this phase — needs operator/design judgment, documented in TODO)

- **Family consistency pass / contact-sheet + regenerate outliers (item 2)** — image-generation
  taste work; requires generating multiple candidates and human aesthetic selection. Out of scope
  for an autonomous code PR; leave for an ARCHITECT-run taste session.
- **Official Forge crop vs regenerated art (item 5)** — a brand/taste decision on the source crop.
- **Final subsystem colours → regrade art (item 6)** — explicitly blocked on the deferred palette
  decision; regenerating/regrading art must wait for that call.
Keep these three ticked as remaining in TODO.md with the "deferred — design decision" reason.

## Files

- `libs/contracts/src/subsystems/subsystems.contract.test.ts` (fs existence check)
- `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx` (band height,
  image-set in heroBandStyle)
- `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.test.tsx` (image-branch
  case, height/`image-set` assertions)
- `apps/web/public/subsystems/convert-to-webp.py` (new) + generated `*.webp` (8 files)

## Verification

- Run the conversion script; confirm 8 `*.webp` files exist and are smaller than their JPGs.
- `pnpm check:types` clean; scoped lint.
- `pnpm exec vitest run libs/contracts/src/subsystems apps/web/features/subsystems` green.
- Visual: screenshot a couple of subsystem drawers — art breathes at the new band height; WebP
  loads (network shows `.webp`) with JPG fallback intact.

## Constraints

- Registry `heroImage` contract string stays as-is (derive webp path in the component). No `any`,
  no raw inline DOM style (heroBandStyle is a DS `Container` `style` passthrough — allowed). Keep
  repo weight sane (WebP smaller than JPG; do not commit source/PSD-scale files). Don't touch the
  chat scene or unrelated subsystems code.
