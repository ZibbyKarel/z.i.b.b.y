# F6 — Delivery entities: projects, companies, integrations

Part of the HUD → Chat UI migration.

**The recipe lives in `docs/plans/hud2chat-F3-catalogs-a.md` — read its 9 numbered steps.**
Read also `docs/hud2chat/DECISIONS.md` (D5, D7, D10, D12, **D13**) and the reference
migrations `features/settings/` (`d7d2b106`), `features/skills/` (`f01c2395`),
`features/agents/` (`c4fe68cb`), `features/pipelines/` + `features/chains/` (`5765336d`).

**This is the hardest phase.** `projects/ProfileScreen.tsx` is 685 LOC composing eight
panels — the largest single screen in the app. It is scheduled last on purpose, after the
shell has survived eighteen pages. Slow down.

## Scope — seven routes

| Route | File | LOC | Notes |
| --- | --- | --- | --- |
| `/projects` | `features/projects/Screen.tsx` | 171 | list + `CategoryDialog` |
| `/projects/[id]` | `features/projects/ProfileScreen.tsx` | 685 | **the big one** — 8 panels |
| `/projects/new` | its own route | — | check whether it reuses `ProfileScreen` or has its own form |
| `/projects/[id]/integrations/[integrationId]` | `features/integrations/DetailScreen.tsx` | 188 | nested two levels deep |
| `/companies` | `features/companies/Screen.tsx` | 64 | smallest list in the app |
| `/companies/[id]` | `features/companies/DetailScreen.tsx` | 339 | also serves `/companies/new` with no id |
| `/companies/new` | same `DetailScreen`, no `id` prop | — | creates, then redirects to `/companies/:id` |

## What is different here — read before starting

1. **`ProfileScreen` composes eight panels:** `InboxPanel`, `ProjectCiStatusChip`,
   `ProjectCompanyPanel`, `ProjectIntegrationActivityPanel`, `ProjectIntegrationsPanel`,
   `ProjectPullRequestsPanel`, `ProjectRunSummary`, `ProjectSecretsPanel`. Migrate the
   **page frame only** — swap the shell, pass `surface="glass"` to its `HudPanel`s, keep every
   panel's internals untouched. Do not restructure this page. If it has tabs, they stay.
2. **Nested back targets.** The integration detail sits two levels deep. Its back button
   should return to **its project** (`/projects/<id>`), not to `/projects` and not to `/chat`.
   That is a dynamic `backHref` built from the route params — the first in this migration.
3. **Create-vs-edit in one component.** `companies/DetailScreen` serves both `/companies/[id]`
   and `/companies/new`. Title, subtitle, actions and `backHref` must all be right in both
   modes (same class of bug as F5's route-id-vs-selection trap). Check `/projects/new` for the
   same pattern before assuming it differs.
4. **D13 applies** if any of these render `EntityHero` — note it, do not patch it. The
   `EntityHero`/header dedup becomes one decision immediately after this phase.
5. **`/projects` is already in `ChatToolDock`; `companies` is too.** Verify rather than assume;
   the audit says both lists are reachable but every detail/new route is orphaned. After this
   phase they are reachable by clicking through the list, which is the intended path.

## Cross-surface regression risks
- The subsystem drawer's `GatesTab` links to `/projects/:id?tab=profile` — a **query-param
  deep link into a specific tab**. Verify it still lands on the right tab once the route is
  fullscreen. This is the highest-value check in the phase.
- `ProjectIntegrationsPanel` navigates to the nested integration detail route.
- Company↔project linking (`LinkProjectDialog`) crosses both sections.

## Out of scope
Restructuring `ProfileScreen` or any of its eight panels. Changing `EntityHero` (D13).
Touching `GateRulesSection`. Deleting `MainLayout` or `/runs`. **Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix` on touched files; `pnpm check:lint`.
- `npx tsc -p apps/web --noEmit` and `npx tsc -p libs/design-system --noEmit` — tsc DIRECTLY.
  Both are known-clean on this branch; any error is yours.
- Scoped vitest (`web-components`, `@zibby/design-system`).
- **Live browser verification is mandatory**: `/projects`, a project profile, its
  integration detail, `/companies`, a company, `/companies/new`, and the `GatesTab` deep link
  into `?tab=profile`. Report the header and back target you actually observed for each.
  Note: the shell body is the scroll container, so Playwright `fullPage: true` only captures
  the viewport — scroll the inner container instead.
