# Phase 41 — Propagate the honest "couldn't load" state to the catalog screens

> Priority axis (LOOP.md): **#1 FUNCTIONALITY** (honest status) — completes the
> Phase-40 pattern across the velín.

## Gap

Phase 40 built the shared `LoadError` and wired the **agents** screen so an API outage
no longer reads as an empty workspace. The same `const { data = [] } = useXQuery()` shape
— empty-state on a query error — still lived in every other catalog screen.

## Fix

- New thin `apps/web/components/LoadError/QueryError.tsx`: `LoadError` pre-wired with the
  shared `common.loadError*` i18n (`useTranslations("common")`). One import + one `onRetry`
  prop per screen — avoids duplicating the strings into every feature namespace.
- Wire it into **skills**, **pipelines**, **projects**, **gates**, **memory** Screens:
  change the primary-list-query destructure to keep the query object
  (`const xQuery = useXQuery(); const x = xQuery.data ?? []`), then render `<QueryError
  onRetry={() => void xQuery.refetch()} />` when `xQuery.isError` — error takes precedence
  over the empty state. `pipelines` and `memory` already early-return their empty state, so
  they get a matching error early-return.
- i18n `common.loadErrorTitle` / `loadErrorDescription` / `retry` (cs+en), generic wording
  ("your data is fine, just not reachable").

## Tests
- `QueryError.test.tsx`: renders the shared `common` title; the retry button calls `onRetry`.
- Existing `LoadError.test` + all screen tests stay green (query mocks returning `{ data }`
  have `isError` undefined → falsy → the empty/content path is unchanged).

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).

## Follow-up
`integrations` uses the shared `Collection` component (not `EmptyState`) — add an error
state to `Collection` to finish the sweep.
