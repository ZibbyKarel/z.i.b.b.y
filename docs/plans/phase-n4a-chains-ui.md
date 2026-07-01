# Phase N4a — Chains UI (the N2b capability gets its operator surface)

> First N4 slice, prioritized as FUNCTIONALITY: the chain API (N2b) is complete but
> the operator cannot compose or watch a chain from the velín. Grammar-compliant by
> construction: card click → detail route, dialog only for create, primary actions
> top-right, every control labeled.

## Build

- `features/chains/` per the query/mutation conventions: `queries/keys.ts`
  (dependency-free), `useChainsQuery`, `useChainRunsQuery` (SSE-gated fallback poll —
  chain state moves exactly on pipeline-run transitions, which the `/api/events`
  stream already pushes; `RunEventsProvider` invalidates the chain-runs key on the
  `pipeline-runs` scope), `useCreateChainMutation` / `useDeleteChainMutation` /
  `useStartChainMutation`.
- `Screen.tsx` mirroring the pipelines screen: chain cards (click → `/chains/:id`),
  detail panel (name/desc, ordered step chips, Run + Delete top-right), runs panel
  (status badge, parked reason, per-step state).
- `NewChainDialog` — name (id slugged via `utils/slug`), instructions, ordered steps
  composed from pipeline selects (add/remove).
- Routes `app/(dashboard)/chains/page.tsx` + `chains/[id]/page.tsx`; nav item
  (glyph "link", after pipelines); i18n `nav.chains` + `chains.*` (cs/en).

## Tests

- [ ] `NewChainDialog.test.tsx`: composes steps, slugs the id, submits the
      CreateChainInput; disables submit without a pipeline step.
- [ ] `Screen.test.tsx` (mocked hooks): renders cards + empty state; card click
      navigates; Run calls the start mutation; runs panel shows status + parked reason.
- [ ] `runEvents.test.tsx` addition: a `pipeline-runs` event invalidates the
      chain-runs key.

## Out of scope (→ later N4 slices)

- CI chip + briefing red line (N4b), the section-by-section grammar audit (N4c+),
  chain editing (delete + re-create per contract v1).
