# Phase 42 — `Collection` error state finishes the honest-load sweep

> Priority axis (LOOP.md): **#1 FUNCTIONALITY** (honest status) — the last catalog surface.

## Gap

Phases 40–41 gave every `EmptyState`-based catalog screen an honest "couldn't load" state.
The one remaining screen is `/integrations`, which renders through the shared `Collection`
component. `Collection` had an `empty` prop but **no error state**, so an API outage there
still read as "no integrations yet — connect your first."

## Fix (behaviour-preserving)

- `apps/web/components/Collection/Collection.tsx`: add an optional
  `error?: LoadErrorProps` prop — symmetric with the existing `empty: EmptyStateProps`, so
  `Collection` stays i18n-agnostic (the caller passes the strings, exactly like `empty`).
  Render order: **`error` → `empty` → grid** (a failed load must never read as empty).
- `apps/web/features/integrations/Screen.tsx`: keep the query object
  (`const integrationsQuery = useIntegrationsQuery(); const integrations =
  integrationsQuery.data ?? []`) and pass `error={integrationsQuery.isError ? { title:
  t("common.loadErrorTitle"), description: t("common.loadErrorDescription"), retryLabel:
  t("common.retry"), onRetry: () => void integrationsQuery.refetch() } : undefined}`
  (it already uses the root `useTranslations()`, so `common.*` resolves).

## Tests
`Collection.test.tsx` (extend): with `error` set, the `LoadError` renders and the empty
state does **not** — even with no items. Existing items/empty cases unchanged.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).

## Sweep complete
After this phase the honest-load state covers every catalog surface (agents, skills,
pipelines, projects, gates, memory, integrations). With the obvious HUD gaps exhausted
across ~16 phases, the loop should now await operator direction (or a newly-spotted bug)
rather than manufacture low-value work.
