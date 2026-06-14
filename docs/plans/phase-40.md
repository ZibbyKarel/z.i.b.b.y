# Phase 40 — Honest "couldn't load" state (an API error ≠ an empty workspace)

> Priority axis (LOOP.md): **#1 FUNCTIONALITY** (honest status). The intended
> cross-feature coupling sweep found no real smells, so per "don't invent refactors"
> the loop pivoted to a real gap surfaced during that sweep.

## Coupling-sweep result (no refactor)

Grepping `apps/web/features` for `from "../../<other-feature>/(components|hooks)/…"`
found three cross-feature imports — `runs → approvals/components` (a run renders an
approval), `agents → gates/components` (the agent editor shows gate rules),
`settings → voice/hooks` (the voice-setting picker). All are **legitimate domain
composition** — a surface reusing the component of the domain it displays — not a
generic component misplaced in the wrong feature (which is what Phase 39's
`RuntimeBadges` was). So: no extraction.

## The real gap

Every catalog Screen does `const { data = [] } = useXQuery()`. When the API is
**unreachable**, the query errors → `data` is `[]` → the screen renders its **empty
state** ("no agents yet — create your first…"). So an outage reads as an *empty
workspace*: dishonest status (North Star "always answerable / honest"), and it could nudge
the operator to recreate entities that already exist. 8 catalog screens share this shape;
only 2 reference an error at all.

## Fix

- New shared `apps/web/components/LoadError/LoadError.tsx`, mirroring `EmptyState`:
  i18n-agnostic string props (`title`, `description`, `retryLabel?`, `onRetry?`), DS
  `Card` (glass/dashed) + `IconTile glyph="warn" tone="warn"` + an optional
  `Button icon="retry"`. `LoadErrorTestId.Root` + `.Retry`. Reusable across catalogs.
- `agents/Screen.tsx`: read the full query (`const agentsQuery = useAgentsQuery(); const
  agents = agentsQuery.data ?? []`). When `agentsQuery.isError`, render `<LoadError
  onRetry={() => agentsQuery.refetch()} …>` in place of the empty/sections block (error
  takes precedence over empty). i18n `agents.loadErrorTitle`/`loadErrorDescription`/`retry`.

## Tests
- `LoadError.test.tsx`: renders the title + description; the retry button calls `onRetry`;
  with no `onRetry`, no button is shown.

(The agents-Screen wiring is a simple conditional over the new component; a full Screen
test would need to mock ~7 hooks — out of proportion. The component is unit-tested; the
conditional is trivial.)

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).

## Follow-up
Propagate `LoadError` to the other catalog screens (skills / pipelines / projects / gates
/ integrations / memory) — one small phase each, or a batch.
