# F10b — Restore the `main` landmark and the skip link

Closes a regression F10 named rather than shipped quietly. Small, and the last work in the arc.

## The regression

`MainLayout` owned the app's `<main>` element and mounted `SkipLink`. F10 deleted it, so
`apps/web` now has **neither** — verified by grep: no `<main>`, no `as="main"`, no skip
affordance anywhere. `ImmersiveShell` renders a `<header>` but its body is a plain `div`.

This is not the HUD breakage the operator accepted as migration cost — it is an accessibility
property of the **new** design, and the repo's own conventions call for WCAG-conscious markup.

## What to do

1. **The `main` landmark.** Every page needs exactly one. The two page shells are
   `libs/design-system/src/immersive/ImmersiveShell/ImmersiveShell.tsx` (its body `Container`)
   and `features/chat/components/ChatScreen.tsx`. Put the landmark in the shells rather than in
   each page — that is why the shells exist.
   **Check `ChatScreen` for an existing landmark before adding one**, and make sure no route
   ends up with two `<main>`s (a page rendering `ImmersivePage` inside something that already
   supplies one). One per route, verified.
2. **The skip link.** `components/layout/SkipLink/` was deleted in F10 — recover it from git
   (`git show adcda915^:apps/web/components/layout/SkipLink/SkipLink.tsx`) rather than
   rewriting it, unless it was written against HUD-specific markup, in which case say so and
   adapt it. It needs a target id on the landmark, and it must be visible on focus.
   Mount it once, high in the tree — `AppShell` is the natural home now.
3. DS work follows DS conventions: `<Component>TestId` enum, `data-testid`, `getByTestId` as the
   primary selector with roles/ARIA as **assertions** (`toHaveRole`), a co-located jsdom test.
   Note `Container` may already support an `as` prop — check before adding one.

## Out of scope
A broader accessibility audit — that is worth doing, but as its own piece of work, not smuggled
into a regression fix. Restyling. **Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix`; `pnpm check:lint`.
- **Typechecks raw with exit codes** (the filtered form prints "No errors found" while exiting
  non-zero):
  `for p in apps/web apps/api libs/contracts libs/design-system; do rtk proxy npx tsc -p $p --noEmit; echo "$p -> $?"; done`
- `pnpm check:cycles`; full `web-components` and `@zibby/design-system` vitest projects;
  `pnpm web:build`.
- **Live browser at 1680px:** on `/chat` and on one immersive page, press Tab from a fresh load
  and confirm the skip link appears and moves focus to the content. Then assert exactly one
  `main` landmark per page — `document.querySelectorAll('main').length === 1` on each. Report
  the actual numbers you measured, per route.
