# Phase 60 — Run-detail header: hero background image not stretched to full width

> TODO (line 7, refined by the operator mid-flight): _"Stránka Běhy a aktivita - Detail běhu -
> header - hero obrázek na pozadí nebudeme roztahovat na celou šířku **ale zobrazíme ho úplně
> v pravo zmenšený na výšku headeru. Šířka se pak dopočítá.**"_
>
> i.e. NOT full-bleed cover — show the image IN FULL (nothing cropped), anchored to the RIGHT,
> scaled to the header's HEIGHT, with its WIDTH computed from the aspect ratio (`h-full w-auto`,
> `object-contain`).

## Context

Phase 53 rendered the run-detail header's assigned-entity avatar via the DS `EntityHero` — a
**full-bleed** background band: the image is `absolute inset-0 h-full w-full object-cover`, covered by a
vertical `from-surface … to-transparent` scrim, with the whole run header laid over it
(`RunDetail.tsx` lines ~442–588). The operator now wants that background image to NOT stretch across the
full width of the header.

## Design decision (implement this — do not re-ask)

Show the hero image **in full**, anchored to the **right**, **scaled to the header height** with its
width **computed from the aspect ratio** — never full-bleed cover. Concretely:
- The image is `absolute inset-y-0 right-0 h-full w-auto` with **`object-contain`** (show the WHOLE image,
  no cropping — "úplně"), so its rendered height equals the header/band height and its width follows the
  natural aspect ratio. It is NOT `w-full`, NOT `w-1/2`, and NOT `object-cover` — those either stretch or
  crop, both of which the operator explicitly rejected.
- Add a **horizontal** gradient (`bg-gradient-to-r from-surface via-surface/… to-transparent`) over the
  left/content region so the header text stays legible and the image dissolves cleanly into the content on
  its left edge, in ADDITION to keeping the existing vertical scrim so the bottom still reads. Tune the
  fade so it covers the text area but doesn't wash out the (now narrower, right-anchored) image itself.
- Keep the glyph fallback behavior (no image → the existing glyph placeholder). The fallback can stay as
  the current centered glyph OR be right-anchored to match; keep it subtle and legible.

## Where to make it (opt-in DS prop — other consumers keep full-bleed)

`EntityHero` is also used full-bleed by `apps/web/features/agents/DetailScreen.tsx`,
`apps/web/features/pipelines/Screen.tsx`, and `apps/web/features/chat/components/ChatDetailDialog.tsx`.
This change is scoped to the **run detail** only, so add an **opt-in prop** to `EntityHero` and pass it
ONLY from `RunDetail.tsx`. The other three consumers must be visually unchanged.

**Recommended prop:** `imageBleed?: "full" | "band"` (default `"full"` = current behavior). `"band"`
switches to the right-anchored bounded image + horizontal fade described above. (A boolean like
`sideImage?: boolean` is acceptable too — pick one, name it clearly, document it in the prop JSDoc.)

- `libs/design-system/src/components/EntityHero/EntityHero.tsx` — add the prop; branch the image element's
  classes (and add the horizontal gradient) when in `"band"` mode. Keep everything else (children overlay,
  editable upload/remove, testids) intact. Default path unchanged.
- `apps/web/features/runs/components/RunDetail.tsx` — pass the new prop on the `EntityHero` at line ~443.
  Nothing else in the header changes.

Prefer this DS-prop approach over forking the treatment locally in RunDetail (keeps the look in one place,
reusable). Do not introduce raw inline `style` — this is class-based in a DS component, which is allowed.

## Tests
- `libs/design-system/src/components/EntityHero/EntityHero.test.tsx` — add a case: in `"band"` mode the
  image element carries the bounded/right-anchored classes (assert via the `EntityHeroTestId.Image`
  testid + `toHaveClass`), and default mode still full-bleeds. Keep the existing assertions.
- `apps/web/features/runs/components/RunDetail.test.tsx` — the header still renders the avatar image
  (`EntityHeroTestId.Image` with `src`) and all header content/actions; update only if the selector
  changes (it shouldn't). Keep the assertion set.
- Add a Storybook variant in `EntityHero.stories.tsx` for the `"band"` mode (DS convention: stories for
  new variants).

## Verification (run, paste real output — no success claim without it)
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean; DS builds (`npx tsc -p libs/design-system` if it has
  its own tsconfig, else the vitest typecheck).
- Scoped lint: `npx eslint libs/design-system/src/components/EntityHero apps/web/features/runs` clean
  (NEVER bare `pnpm lint`).
- `rtk proxy npx vitest run libs/design-system/src/components/EntityHero` green, and
  `rtk proxy npx vitest run apps/web/features/runs` green modulo the KNOWN pre-existing reds (RunDetail
  cost-cell cs-locale; some TaskCard/PipelineCard) — confirm any red is pre-existing via `git stash`,
  don't chase it.

## Constraints
- React 19 (NO forwardRef), no `any`. Class-based Tailwind in the DS component is fine; NO raw inline
  `style` on DOM nodes in apps/web.
- Other EntityHero consumers (agents, pipelines, chat detail) must be visually unchanged — the new
  behavior is opt-in and defaulted off.
- Do NOT touch operator WIP: `PipelineStageTimeline.tsx`, `.zibby/data/**`, `RunLogStream.tsx`,
  `machine.*`, `design/*`, `apps/web/features/chat/**` internals (beyond the ChatDetailDialog staying on
  the default full-bleed — don't change it).
- Only edit `EntityHero.tsx` (+ test + story) and `RunDetail.tsx` (+ its test).
