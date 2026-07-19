# F10 — Delete the old HUD shell

The final phase. Read `docs/hud2chat/DECISIONS.md` — **O2, O8, D2, D20** — and
`docs/hud2chat/ROADMAP.md`.

O2 said the old shell would be replaced progressively and deleted at the end. This is the end.
Every route is migrated or gone, F9's audit confirmed reachability, and nothing should still
need the HUD branch.

## Scope

1. **Delete the old chrome**: `components/layout/MainLayout/`, `Sidebar/`, `RightRail/`,
   `TopBar/` — plus their tests and stories. Check each for consumers first; F9 noted several
   orphans were being kept alive *only* by these components and should fall out naturally now.
2. **Simplify `AppShell`** (`components/layout/AppShell/AppShell.tsx`). It currently forks on
   `isFullscreenRoute(pathname)`; with the HUD branch gone there is one path. Read the file's
   own comment about `AppShellInner` persisting across client navigation before restructuring —
   the hook order was deliberately left alone in F0 for a reason that may still hold.
3. **Collapse the route table** (`apps/web/state/config.ts`): `FULLSCREEN_ROUTES` and
   `isFullscreenRoute` exist only to drive that fork (D2) and should go with it. `NAV_ITEMS` /
   `ROUTE_ONLY_ITEMS` fed the deleted sidebar — check what else reads them before deleting;
   `ChatToolDock` resolves its icons through `NAV_ITEMS`, so that one almost certainly stays.
   **Do not assume; grep.**
4. **Delete the `/gates` route (O8)**: `app/(dashboard)/gates/page.tsx` and
   `features/gates/Screen.tsx`. **`GateRulesSection` and `SystemFloorPanel` STAY** — Settings
   and the subsystem drawer both render them. Same shape as F8d, where `features/runs/` survived
   the deletion of its list Screen. Delete the route, not the domain. Remove `/gates` from any
   remaining route table, and drop its `ROUTE_ONLY_ITEMS` entry if nothing else reads it.
5. **`(dashboard)/layout.tsx`** rendered `AppShell` for the whole group — revisit whether the
   route group still earns its existence, but do **not** restructure routing beyond what
   deleting the shell requires. A large routing refactor is not this phase.

## The one thing to be careful about

This phase deletes a lot, and the suite has been green all arc — which means a test that goes
red here is telling you something true. **Do not adjust a test to make a deletion pass.** If
removing the shell breaks a test, either the thing is still needed, or the test is asserting
old chrome and should be deleted wholesale rather than weakened. Say which, per test.

`vitest.setup.tsx`'s global `usePathname` default is `/chat` (set in F8d) — fine, but many
component tests were written assuming HUD chrome exists around them. Expect churn there and
report the shape of it.

## Out of scope
Any new feature. Restyling. Touching `libs/design-system`. Re-opening O7/O8.
**Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix`; `pnpm check:lint`.
- **Typechecks raw with exit codes** (D20 — the filtered form prints "No errors found" while
  exiting non-zero):
  `for p in apps/web apps/api libs/contracts libs/design-system; do rtk proxy npx tsc -p $p --noEmit; echo "$p -> $?"; done`
- `pnpm check:cycles`; full `web-components` and `api` vitest projects.
- `pnpm web:build` — **new for this phase.** Deleting layouts and route groups is exactly the
  class of change that typechecks clean and fails at build time. A green build is the gate here.
- **Live browser at 1680px:** `/chat`, one immersive page from each family (a catalog, an
  entity, settings, `/archiv`), and confirm no nav rail, right rail or HUD top bar survives
  anywhere. Report what you saw.
- Finish with a grep for `MainLayout|Sidebar|RightRail|isFullscreenRoute` and report anything
  left, with a reason.
