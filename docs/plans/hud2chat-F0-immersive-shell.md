# F0 — Immersive shell foundation

Part of the HUD → Chat UI migration. Read `docs/hud2chat/ROADMAP.md` and
`docs/hud2chat/DECISIONS.md` first. Read `.claude/skills/design-system/SKILL.md` before
touching `libs/design-system`.

**Goal:** create the reusable full-page chrome that every migrated HUD section will adopt,
and make `AppShell` able to select it per route. **No page is migrated in this phase** —
F0 must be behaviour-neutral for every existing route.

## Why this shape
The design corpus (`design/Z.I.B.B.Y/ZIBBY Archiv úloh.html`) contains exactly one genuine
sub-page, and its chrome contract is: **round back-to-orb button + title + subtitle in a
thin header band, then the content frame. No orb map, no dock, no rail, no bottombar.**
Everything else in Velín-D is a modal overlay above the orb map. Match that contract.

## Deliverable 1 — `ImmersiveShell` (design system)

`libs/design-system/src/immersive/ImmersiveShell/` — component, co-located jsdom test,
Storybook story, exported from `libs/design-system/src/immersive/index.ts`.

Props (`ImmersiveShellProps`, exported):
- `title: string` — page title.
- `subtitle?: string` — muted one-liner under the title.
- `backSlot?: ReactNode` — the back affordance. **DS must not import `next/link`**; the app
  supplies the link. Render it inside the header's leading round 34px slot.
- `actions?: ReactNode` — right-aligned actions cluster in the header.
- `children: ReactNode` — the page body.

Structure:
- Full-height (`100dvh`) flex column, `overflow: hidden`, with the same scene backdrop
  language `/chat` uses (radial-gradient vignette). Reuse whatever `ChatScreen.tsx` already
  does for the backdrop — **extract it rather than re-inventing a second gradient**; if
  `ChatScreen` keeps its own copy that is fine for now, but the values must match.
- Header: a `GlassSurface` band, fixed height, `flex: 0 0 auto` — `[backSlot] [title /
  subtitle] [spacer] [actions]`. Follow the Design Audit's discipline: 4px spacing grid,
  panel radius 10 / control radius 6, title 22, subtitle 13.
- Body: `flex: 1`, `minHeight: 0`, scrollable.

Requirements:
- Composed from DS primitives (`Container`/`Stack`/`Text`/`GlassSurface`) — no raw inline
  `style` on DOM nodes beyond what DS itself sanctions.
- `ImmersiveShellTestId` enum (`root`, `header`, `back`, `title`, `subtitle`, `actions`,
  `body`) wired to `data-testid`; tests select via `getByTestId`, keep roles/ARIA as
  assertions only.
- DS is i18n-agnostic: English string defaults, no `useTranslations`.
- React 19 — no `forwardRef`. No `any`.

## Deliverable 2 — `ImmersivePage` (app wrapper)

`apps/web/components/layout/ImmersivePage/` — thin wrapper so 14 call sites stay terse.
Supplies the `next/link` back button (default `href="/chat"`, overridable via `backHref`)
with a rotated arrow icon and a translated tooltip/aria-label, plus i18n for anything the
DS component takes as a string. Own testid enum + test.

## Deliverable 3 — per-route shell mode table

`AppShell` currently forks on a single hardcoded `pathname === "/chat"` check
(`apps/web/components/layout/AppShell/AppShell.tsx`). Replace that with an explicit table in
`apps/web/state/config.ts`, e.g.:

```ts
export const FULLSCREEN_ROUTES = ["/chat"] as const;
```

…and a small exported helper (`isFullscreenRoute(pathname)`) that AppShell calls. Later
phases append their routes as they migrate; F10 collapses the table entirely.

**Critical:** hook order in `AppShellInner` must stay stable regardless of branch — the
existing comment in that file explains why. Do not move hooks below the fork.

**Behaviour must not change in this phase:** `/chat` still fullscreen, every other route
still `MainLayout`. Add a test asserting exactly that.

## Verification
- `pnpm exec prettier --write` + `pnpm exec eslint --fix` on every touched file.
- `pnpm check:lint`
- `tsc -p apps/web` **directly** (`rtk pnpm typecheck` lies — the base config does not cover
  apps/web); also typecheck the DS project.
- Scoped vitest for the new/changed test files (design-system project + web-components
  project), not the whole suite.

## Out of scope
Migrating any page. Touching `MainLayout`/`Sidebar`/`RightRail`. Changing `ChatScreen`
behaviour. Do **not** commit — the orchestrator reviews and commits.
