# Phase 25 — System logo swaps to the selected project's logo

> TODO: _"při změně projektu se změní i logo systému z.i.b.b.y na logo, které je
> uložené u projektu aby to zdůraznilo scope projektu."_

## Goal

When a real project is selected in the top-bar scope, the brand mark in the sidebar
swaps from the z.i.b.b.y system logo to the **selected project's logo** (and its name),
to emphasize the active scope. When "Bez projektu" (no-project) is selected, show the
default z.i.b.b.y brand.

Depends on Phase 24 (the single top-bar scope + `useActiveProject()` semantics where
`null` = no-project).

## Current state (recon)

- `apps/web/components/layout/BrandLogo/BrandLogo.tsx` — rendered in the LEFT sidebar
  (`MainLayout.tsx:76`, 224px nav column), wrapped in `<Link href="/overview">`.
  Composed of static pieces + a tagline from `t("tagline")`.
- `apps/web/components/BrandIcon.tsx` — hardcoded `next/image` `src="/z.i.b.b.y-icon.png"`,
  round. Static.
- `apps/web/components/BrandName.tsx` — hardcoded "Z·I·B·B·Y" wordmark. Static.
- Project model has `logo` (optional data-URI, `project.schema.ts:150`) and `name`.
  Precedent: `ProjectCard.tsx:126-128` renders `HudCard glyph="code" logoSrc={project.logo}`
  (glyph is the fallback when no logo).
- Active project: `useActiveProject()` (`features/projects/context/ProjectProvider.tsx`),
  projects list: `useProjectsQuery()` (`features/projects/queries/useProjectsQuery.ts`).

## Approach

Make `BrandLogo` project-aware (it becomes a client component if it isn't already, since
it must read `useActiveProject()`).

- Resolve the active project: `const { activeProjectId } = useActiveProject()`, then find
  it in `useProjectsQuery()` data (`data ?? []`).
- **Real project active:**
  - Icon: render the project's `logo` (data-URI) in the round brand-icon slot. If the
    project has NO `logo`, fall back to a glyph tile (mirror `ProjectCard`'s `glyph="code"`
    fallback) — do NOT show the z.i.b.b.y icon for a real project, so scope is unambiguous.
  - Wordmark: show `project.name` in place of the "Z·I·B·B·Y" wordmark (reuse the
    `BrandName` typography treatment; parametrize `BrandName` to accept the text, keeping
    "Z·I·B·B·Y" as the default so the no-project case is unchanged).
  - Tagline: hide the z.i.b.b.y tagline (or show the project's `desc`/`category` if that
    reads well — keep it simple: hide tagline for a project, or show category if present).
  - The `<Link href="/overview">` wrapper: keep linking to `/overview` (or to the project
    detail `/projects/:id` — pick `/projects/:id` since clicking the active-project brand
    naturally goes to that project; if that complicates the a11y label, keep `/overview`).
    Decide in implementation; default to `/projects/:id` for the project case.
- **No-project (`null`) or unknown:** render exactly today's static z.i.b.b.y brand
  (BrandIcon + BrandName default + tagline). No visual change from current behavior.

Keep it accessible: the icon `alt` / link `aria-label` should name the active project
(e.g. "Projekt X") vs. the z.i.b.b.y default.

## Files touched
- `apps/web/components/layout/BrandLogo/BrandLogo.tsx` (project-aware selection)
- `apps/web/components/BrandName.tsx` (accept optional text prop, default "Z·I·B·B·Y")
- possibly `apps/web/components/BrandIcon.tsx` (accept optional `src`/`alt` + glyph
  fallback, default to the z.i.b.b.y icon) — or handle the project-icon rendering in
  BrandLogo and keep BrandIcon as the default-only fallback.
- i18n if any new label (e.g. brand aria-label) is needed.

## Verification
- `pnpm lint` (scoped) / `pnpm typecheck` / `pnpm test` green (modulo known pre-existing
  failures — confirm via `git stash`).
- Manual: selecting a project with a logo swaps the sidebar mark to that logo + name;
  a project without a logo shows a glyph fallback + name; switching to "Bez projektu"
  restores the z.i.b.b.y brand. Reduced-motion / no layout shift on swap.
- Any existing BrandLogo/BrandName/BrandIcon tests stay green (defaults unchanged).

## Out of scope
- Animated logo transitions beyond a simple swap (design-audit phase may refine).
