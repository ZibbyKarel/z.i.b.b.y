# Phase 43 — Surface silent mutation failures (a global error toaster)

> Priority axis (LOOP.md): **#1 FUNCTIONALITY** (always-answerable for writes). The
> write-side twin of the Phase 40–42 read-side honest-load sweep.

## Gap

The `QueryClient` (`app/providers.tsx`) had only `defaultOptions.queries` — **no
`mutationCache`** — and the app has **no toast/notification surface**. So a failed write
(delete / create / update / toggle / approve / reject) is **silent**: the operator clicks
"Delete", the API is down, the item stays, and they assume it worked. North Star "always
answerable" covers writes too.

**ts-rest behaviour check:** `@ts-rest/react-query` with `validateResponse: true` **throws**
on network failures, unknown statuses (e.g. a 500 not in the contract), and schema-drift —
so react-query's `onError` fires for those. Known in-contract 4xx (404/422/409) resolve to
the call site instead. The global toaster therefore covers the **network/server** failure
case — the most common "silent delete failed" scenario.

## Fix (one wiring point covers every mutation)

- `apps/web/components/Toaster/toastBus.ts`: a tiny module pub/sub — `emit({message?})`,
  `subscribe(fn) → unsubscribe`. Counter-keyed ids (no `Date.now`/`Math.random`, which are
  banned in this codebase).
- `apps/web/components/Toaster/Toaster.tsx`: subscribes to the bus, holds the toast list in
  state, renders DS `Alert severity="error"` in a fixed overlay (a positioned `div` behind
  the sanctioned `// eslint-disable-next-line react/forbid-dom-props`), auto-dismisses after
  ~6s, dismisses on `Alert` close. The localized copy lives here (`common.mutationError`) —
  a toast with no `message` falls back to it — so the non-React cache callback stays i18n-free.
- `app/providers.tsx`: `new QueryClient({ defaultOptions, mutationCache: new MutationCache({
  onError: () => toastBus.emit() }) })`; mount `<Toaster />` inside the providers.
- i18n `common.mutationError` (cs+en).

## Tests
- `toastBus.test.ts`: a subscriber receives emitted toasts; after unsubscribe it does not.
- `Toaster.test.tsx`: on `toastBus.emit()` it renders the localized `common.mutationError`;
  pressing the alert close dismisses it. (Use `act` for the bus emit.)

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).

## Notes / follow-up
Known in-contract 4xx (validation/conflict) still resolve to the call site — forms already
validate; surfacing those per-action is a later, narrower phase if needed. After this, the
"always answerable" gap is closed for both reads (40–42) and the common write-failure case.
