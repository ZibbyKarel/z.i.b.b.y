# Phase 44 — A loading state, not a flash of "create your first"

> Priority axis (LOOP.md): **#2 DESIGN/UX** (honest status during load). Completes the
> load-state trio: loading → error → content.

## Gap (verified, not masked)

Every catalog screen does `const { data = [] } = useXQuery()` with no `isPending` guard,
so on a **cold** query the first render shows `data = []` → the **empty state** ("no agents
yet — create your first…") for a beat until data arrives.

`BootSplash` does NOT mask it generally: its `isReady = () => true` (a 600ms timer, not a
data gate), the app renders underneath the splash the whole time, and **the splash never
replays on SPA navigation** (only on a full reload). So the first in-session visit to each
screen (cold cache, no splash) flashes "your workspace is empty." Same family as the
Phase-40 error-vs-empty bug, for the loading moment.

## Fix (cheap — query objects already kept by Phases 40–42)

- New shared `apps/web/components/LoadingState/LoadingState.tsx` mirroring
  `EmptyState`/`LoadError` (glass/dashed `Card`, faint pulse `Icon`, a quiet label string)
  + a `QueryLoading` wrapper pre-wired with `common.loading` (one-liner per screen, like
  `QueryError`).
- Catalog screens (agents / skills / pipelines / projects / gates / memory) render
  `<QueryLoading />` when the primary list query `isPending` — **loading → error → empty →
  content**. (`xQuery` already exists on each from the load-error sweep.) `pipelines` +
  `memory` add a loading early-return before their error early-return.
- `Collection` gains an optional `loading?: boolean` (renders `LoadingState` first);
  `integrations/Screen` passes it from `integrationsQuery.isPending`.

## Tests
- `LoadingState.test.tsx`: renders the label.
- `Collection.test.tsx`: with `loading` set, `LoadingState` renders over error/empty/items.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).

## Note
`isPending` (react-query v5) is true only while a query has no data yet and is enabled —
exactly the cold-load moment; a cache-warm SPA nav (staleTime 30s) is `isPending: false`
→ no loading flash. After this the honest load-state arc is complete; with the obvious HUD
gaps exhausted (~19 phases), the loop should await operator direction rather than
manufacture low-value work.
