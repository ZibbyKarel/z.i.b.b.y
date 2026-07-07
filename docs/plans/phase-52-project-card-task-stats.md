# Phase 52 — Project card footer shows the same task stats as the project detail (line 89)

> TODO (line 89): _"stránka Projekty - na kartě projektu zobrazíme ve footeru stejné
> statistiky jako máme v detailu projektu ohledně úkolů (mimo 'Celkem'). Opět budou
> jednotlivé části možné prokliknout na vyfiltrovanou stránku běhy a aktivita."_

## Goal

On the Projects list, each `ProjectCard` footer shows the SAME per-task-status statistics that the
project DETAIL page shows (EXCEPT the "Celkem"/total figure). Each stat is clickable → navigates to
the runs/activity page pre-filtered to that project + that status.

## Recon (implementer)

- **Project detail task stats**: find the "úkoly"/task-status breakdown on the project detail
  (`apps/web/features/projects/ProfileScreen.tsx` and/or a component it renders). Identify the exact
  stat set (the per-status counts) and the "Celkem"/total that must be EXCLUDED here. Note how it
  computes them (which query/hook — likely the runs feed scoped to the project, or a project-stats
  query). REUSE that same source so the card and detail never diverge.
- **ProjectCard footer**: `apps/web/features/projects/components/ProjectCard.tsx` currently renders a
  Phase-8 budget footer (`BudgetBar` + `Stat` running/queued/held) when a `budget` is present. Decide:
  add the task-status stats as the footer (or alongside budget) using the DS `Stat` primitive already
  imported. Keep it compact.
- **Filtered runs deep-link**: the runs/activity screen already supports `?run=`/`?filter=` deep-links
  (per ProfileScreen's read-once/write-on-change comment). Find the exact query-string the runs Screen
  reads for project + status filtering (memory: query-string route templates need `as Route`), and build
  each stat as a link to `/runs?...` with the project + status filter. A card-level stat click must NOT
  also trigger the card's own navigation (stopPropagation / the stat is its own link).

## Approach

- Extract or reuse the project task-stat computation so ProjectCard and the detail share ONE source
  (a small hook or selector, e.g. `useProjectTaskStats(projectId)` if one doesn't already exist —
  check first; the detail may already have it). Do NOT duplicate the counting logic.
- Render the per-status stats (minus total) in the ProjectCard footer via DS `Stat`, each wrapped as a
  `next/link` to the filtered runs page (project + status). Guard against the card's own click nav.
- Keep the existing budget footer behavior coherent (either the task stats replace it or sit with it —
  pick the cleaner layout; the operator asked specifically for the task stats, so lead with those).
- i18n for any new labels (cs default + en) — reuse the detail's existing label keys if present.

## Files
- `apps/web/features/projects/components/ProjectCard.tsx` (+ test)
- possibly a shared `apps/web/features/projects/queries/useProjectTaskStats*.ts` (only if not already
  existing; re-export from the domain's queries/index.ts)
- `apps/web/features/projects/ProfileScreen.tsx` ONLY if extracting its stat computation into the shared
  hook (keep the detail visually identical).
- i18n `apps/web/i18n/messages/{cs,en}.json` if new labels are needed.

## Verification
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- Scoped lint: `npx eslint apps/web/features/projects` (NEVER bare `pnpm lint`).
- `rtk proxy npx vitest run apps/web/features/projects` green (confirm any pre-existing red via `git stash`).
- Manual: a project card footer shows the per-status task stats (no total); clicking one lands on
  /runs filtered to that project + status; the card's own click-to-detail still works elsewhere.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` (DS `Stat`/`Stack`/`Container` props).
  Reuse the detail's stat source — no divergent counting. Don't touch operator WIP (SummaryWidget,
  machine.*, design/*, `apps/web/features/chat/**`, `RunLogStream.tsx`).
